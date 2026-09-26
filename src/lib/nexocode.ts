import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { decrypt } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { assertSafeUrl } from "@/lib/safe-url";
import { CLOUD_PREFIX, ensureSessionPod, getEnvironment, getSessionRow, listEnvironments, type SessionRow, workspacesAllowed } from "@/lib/workspaces";

export const ENV_SERVER_ID = "env";

export type CodeServer = {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string | null;
  directory: string | null;
  managed: boolean;
};

export const CodeServerInput = z.object({
  name: z.string().trim().min(1).max(60),
  url: z.string().trim().url().max(500),
  username: z.string().trim().min(1).max(60).default("nexocode"),
  password: z.string().max(500).optional(),
  directory: z.string().trim().max(500).optional(),
});

/**
 * Deja la URL base sin barra final ni query, que es como se le van pegando
 * las rutas de la API.
 */
export function normalizeServerUrl(raw: string) {
  const url = new URL(raw);
  url.search = "";
  url.hash = "";
  return url.href.replace(/\/+$/, "");
}

function envServerFor(email: string): CodeServer | null {
  const url = process.env.NEXOCODE_URL;
  if (!url) return null;
  const allowed = (process.env.NEXOCODE_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.includes(email.toLowerCase())) return null;
  return {
    id: ENV_SERVER_ID,
    name: process.env.NEXOCODE_NAME ?? "Este servidor",
    url: normalizeServerUrl(url),
    username: process.env.NEXOCODE_USERNAME ?? "nexocode",
    password: process.env.NEXOCODE_PASSWORD ?? null,
    directory: process.env.NEXOCODE_DIRECTORY ?? null,
    managed: true,
  };
}

/**
 * Servidores de Nexo Code que puede usar el usuario: los que agregó él y, si
 * su email está en `NEXOCODE_ALLOWED_EMAILS`, el que se configura por entorno.
 * El del entorno corre en la misma máquina, por eso no se abre a cualquiera.
 */
export async function listCodeServers(user: { id: string; email: string }): Promise<CodeServer[]> {
  const rows = await db.select().from(schema.codeServer).where(eq(schema.codeServer.userId, user.id)).orderBy(asc(schema.codeServer.createdAt));
  const own = rows.map((r) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    username: r.username,
    password: r.password ? decrypt(r.password) : null,
    directory: r.directory,
    managed: false,
  }));
  const env = envServerFor(user.email);
  const cloud: CodeServer[] = (await workspacesAllowed(user))
    ? (await listEnvironments(user.id)).map((e) => ({ id: `${CLOUD_PREFIX}${e.id}`, name: e.name, url: "", username: "nexocode", password: null, directory: null, managed: true }))
    : [];
  return [...cloud, ...(env ? [env] : []), ...own];
}

type User = { id: string; email: string; name?: string | null };

export function isCloud(serverId: string) {
  return serverId.startsWith(CLOUD_PREFIX);
}

/**
 * Busca un servidor que el usuario agregó o el del entorno. Los entornos en
 * la nube no son un servidor fijo (cada sesión tiene su contenedor), así que
 * para ellos hay que usar `sessionTarget`.
 */
export async function getCodeServer(user: User, id: string): Promise<CodeServer> {
  if (isCloud(id)) throw new HttpError(400, "Falta la sesión");
  if (id === ENV_SERVER_ID) {
    const env = envServerFor(user.email);
    if (env) return env;
  } else {
    const row = await db.query.codeServer.findFirst({ where: and(eq(schema.codeServer.id, id), eq(schema.codeServer.userId, user.id)) });
    if (row) {
      return {
        id: row.id,
        name: row.name,
        url: row.url,
        username: row.username,
        password: row.password ? decrypt(row.password) : null,
        directory: row.directory,
        managed: false,
      };
    }
  }
  throw new HttpError(404, "No encontré ese servidor de código");
}

/**
 * Resuelve a qué nexocode y a qué sesión de adentro hablarle. En la nube la
 * sesión de Nexo trae su propio contenedor, que se prende si estaba apagado.
 */
export async function sessionTarget(user: User, serverId: string, sessionId: string): Promise<{ server: CodeServer; session: string; row: SessionRow | null }> {
  if (!isCloud(serverId)) return { server: await getCodeServer(user, serverId), session: sessionId, row: null };
  const row = await getSessionRow(user.id, sessionId);
  if (`${CLOUD_PREFIX}${row.environmentId}` !== serverId) throw new HttpError(404, "No encontré esa sesión");
  if (!row.agentSessionId) throw new HttpError(409, "La sesión todavía está arrancando");
  const env = await getEnvironment(user.id, row.environmentId);
  return { server: await ensureSessionPod(user, row, env.name), session: row.agentSessionId, row };
}

type Options = RequestInit & { query?: Record<string, string | undefined>; timeout?: number | null };

/**
 * Llama a la API de nexocode con la contraseña del servidor y la carpeta del
 * proyecto. Las URLs que agregó un usuario se validan para que no apunten a la
 * red interna de Nexo; la del entorno es de confianza.
 */
export async function nexocodeFetch(server: CodeServer, path: string, { query, timeout = 20_000, ...init }: Options = {}) {
  const url = new URL(server.url + path);
  const params = { directory: server.directory ?? undefined, ...query };
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  if (!server.managed) {
    try {
      await assertSafeUrl(url.href);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
  }
  const headers = new Headers(init.headers);
  if (server.password) headers.set("Authorization", `Basic ${Buffer.from(`${server.username}:${server.password}`).toString("base64")}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
      redirect: "error",
      signal: init.signal ?? (timeout ? AbortSignal.timeout(timeout) : undefined),
    });
  } catch (err) {
    if ((err as Error).name === "AbortError" && init.signal?.aborted) throw err;
    throw new HttpError(502, `No pude conectar con ${server.name}. ¿Está corriendo \`nexocode serve\`?`);
  }
  if (res.status === 401) throw new HttpError(502, `${server.name} rechazó la contraseña`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { data?: { message?: string } } | null;
    throw new HttpError(502, body?.data?.message ?? `${server.name} respondió ${res.status}`);
  }
  return res;
}

export async function nexocodeJson<T>(server: CodeServer, path: string, options?: Options): Promise<T> {
  const res = await nexocodeFetch(server, path, options);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function publicServer(s: CodeServer) {
  return { id: s.id, name: s.name, url: s.url, directory: s.directory, managed: s.managed, hasPassword: Boolean(s.password), cloud: isCloud(s.id) };
}

export const PromptInput = z.object({
  text: z.string().trim().min(1).max(100_000),
  model: z.object({ providerID: z.string().max(100), modelID: z.string().max(200) }).optional(),
  agent: z.enum(["build", "plan"]).optional(),
  variant: z.string().max(40).optional(),
  context: z.string().max(4000).optional(),
  files: z
    .array(z.object({ name: z.string().max(200), mime: z.string().max(120), url: z.string().startsWith("data:").max(14_000_000) }))
    .max(10)
    .default([]),
});

export type PromptInput = z.infer<typeof PromptInput>;

/**
 * Crea una sesión en nexocode. Con `ask` el agente pide permiso antes de
 * correr comandos, editar archivos o leer páginas.
 */
export async function createSession(server: CodeServer, { title, ask }: { title?: string; ask?: boolean }) {
  const permission = ask ? ["bash", "edit", "webfetch"].map((p) => ({ permission: p, pattern: "*", action: "ask" })) : undefined;
  return nexocodeJson<{ id: string; title: string }>(server, "/session", {
    method: "POST",
    body: JSON.stringify({ ...(title ? { title } : {}), ...(permission ? { permission } : {}) }),
  });
}

/**
 * Manda un mensaje a la sesión sin esperar la respuesta; lo que contesta el
 * agente llega por los eventos.
 */
export async function sendPrompt(server: CodeServer, session: string, input: PromptInput) {
  await nexocodeFetch(server, `/session/${encodeURIComponent(session)}/prompt_async`, {
    method: "POST",
    body: JSON.stringify({
      parts: [
        ...(input.context ? [{ type: "text", text: input.context, synthetic: true }] : []),
        ...input.files.map((f) => ({ type: "file", mime: f.mime, filename: f.name, url: f.url })),
        { type: "text", text: input.text },
      ],
      model: input.model,
      agent: input.agent,
      ...(input.variant ? { variant: input.variant } : {}),
    }),
  });
}

type ShellPart = { type: string; tool?: string; state?: { status?: string; input?: { command?: string }; output?: string; error?: string } };

/**
 * Corre un comando en la carpeta del proyecto como si lo escribiera el
 * usuario (no pasa por los permisos del agente) y devuelve su salida. Queda
 * guardado en la sesión, así el agente sabe que se corrió.
 */
export async function runShell(server: CodeServer, session: string, command: string, model?: PromptInput["model"]) {
  const id = encodeURIComponent(session);
  await nexocodeFetch(server, `/session/${id}/shell`, { method: "POST", timeout: 10 * 60_000, body: JSON.stringify({ agent: "build", command, ...(model ? { model } : {}) }) });
  const messages = await nexocodeJson<{ parts: ShellPart[] }[]>(server, `/session/${id}/message`);
  const part = messages
    .flatMap((m) => m.parts)
    .findLast((p) => p.type === "tool" && p.tool === "bash" && p.state?.input?.command === command);
  return { ok: part?.state?.status === "completed", output: part?.state?.output ?? part?.state?.error ?? "" };
}

/**
 * El nexocode al que va una petición que no nombra la sesión en la ruta. En
 * la nube hace falta `?session=` para saber a qué contenedor ir.
 */
export async function serverFromRequest(user: User, serverId: string, request: Request) {
  if (!isCloud(serverId)) return getCodeServer(user, serverId);
  const session = new URL(request.url).searchParams.get("session");
  if (!session) throw new HttpError(400, "Falta la sesión");
  return (await sessionTarget(user, serverId, session)).server;
}
