import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { decrypt } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { assertSafeUrl } from "@/lib/safe-url";
import { ensureWorkspace, WORKSPACE_SERVER_ID, workspacesAllowed } from "@/lib/workspaces";

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
    ? [{ id: WORKSPACE_SERVER_ID, name: "Mi espacio en la nube", url: "", username: "nexocode", password: null, directory: null, managed: true }]
    : [];
  return [...cloud, ...(env ? [env] : []), ...own];
}

export async function getCodeServer(user: { id: string; email: string; name?: string | null }, id: string): Promise<CodeServer> {
  if (id === WORKSPACE_SERVER_ID) return ensureWorkspace(user);
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
  return { id: s.id, name: s.name, url: s.url, directory: s.directory, managed: s.managed, hasPassword: Boolean(s.password), cloud: s.id === WORKSPACE_SERVER_ID };
}
