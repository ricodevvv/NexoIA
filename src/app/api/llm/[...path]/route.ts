import { and, eq } from "drizzle-orm";
import { resolveKey } from "@/lib/ai/keys";
import { remoteModelId } from "@/lib/ai/models";
import { decrypt } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import { enforce } from "@/lib/rate-limit";
import { handleError, HttpError } from "@/lib/session";
import { hashToken, workspaceModels } from "@/lib/workspaces";

const LIMIT = { window: 60, max: 120 };
const PASS_HEADERS = ["anthropic-version", "anthropic-beta", "openai-beta", "accept"];

type Target = { url: string; headers: Record<string, string>; allowed: (model: string) => boolean };

async function workspaceUser(request: Request) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const token = request.headers.get("x-api-key") ?? bearer;
  if (!token?.startsWith("nws_")) throw new HttpError(401, "Falta el token del espacio de trabajo");
  const row = await db.query.codeWorkspace.findFirst({ where: eq(schema.codeWorkspace.tokenHash, hashToken(token)) });
  if (!row) throw new HttpError(401, "Token inválido");
  return row.userId;
}

/**
 * Decide a dónde va la petición según la ruta y con qué key. Solo deja pasar
 * los modelos que el usuario tiene disponibles.
 */
async function target(userId: string, path: string[]): Promise<Target> {
  const [family, ...rest] = path;
  const models = await workspaceModels(userId);
  const allow = (filter: (m: (typeof models)[number]) => boolean) => {
    const ids = new Set(models.filter(filter).map((m) => remoteModelId(m.id)));
    return (model: string) => ids.has(model);
  };
  if (family === "anthropic" && rest[0] === "v1") {
    const key = await resolveKey(userId, "anthropic");
    if (!key) throw new HttpError(403, "No hay key de Anthropic disponible");
    return { url: `https://api.anthropic.com/${rest.join("/")}`, headers: { "x-api-key": key.apiKey }, allowed: allow((m) => m.provider === "anthropic") };
  }
  if (family === "openai" && rest[0] === "v1") {
    const key = await resolveKey(userId, "openai");
    if (!key) throw new HttpError(403, "No hay key de OpenAI disponible");
    return { url: `https://api.openai.com/${rest.join("/")}`, headers: { Authorization: `Bearer ${key.apiKey}` }, allowed: allow((m) => m.provider === "openai") };
  }
  if (family === "compat" && rest[0] === "v1" && process.env.COMPAT_BASE_URL) {
    const key = await resolveKey(userId, "compat");
    const base = process.env.COMPAT_BASE_URL.replace(/\/+$/, "");
    return {
      url: `${base}/${rest.slice(1).join("/")}`,
      headers: key?.apiKey ? { Authorization: `Bearer ${key.apiKey}` } : {},
      allowed: allow((m) => m.provider === "compat" && !m.endpointId),
    };
  }
  if (family === "ep" && rest[1] === "v1") {
    const endpoint = await db.query.userEndpoint.findFirst({
      where: and(eq(schema.userEndpoint.id, rest[0]), eq(schema.userEndpoint.userId, userId)),
    });
    if (!endpoint) throw new HttpError(404, "Endpoint no encontrado");
    return {
      url: `${endpoint.baseUrl.replace(/\/+$/, "")}/${rest.slice(2).join("/")}`,
      headers: endpoint.apiKey ? { Authorization: `Bearer ${decrypt(endpoint.apiKey)}` } : {},
      allowed: allow((m) => m.endpointId === endpoint.id),
    };
  }
  throw new HttpError(404, "Ruta de modelos desconocida");
}

async function proxy(request: Request, ctx: RouteContext<"/api/llm/[...path]">) {
  try {
    const { path } = await ctx.params;
    if (path.some((p) => p === ".." || p === "." || !/^[\w.-]+$/.test(p))) throw new HttpError(400, "Ruta inválida");
    const userId = await workspaceUser(request);
    await enforce([{ key: `llm:u:${userId}`, ...LIMIT }]);
    const t = await target(userId, path);

    let body: string | undefined;
    if (request.method === "POST") {
      body = await request.text();
      if (body.length > 25_000_000) throw new HttpError(413, "La petición es demasiado grande");
      const model = (JSON.parse(body || "{}") as { model?: string }).model;
      if (model && !t.allowed(model)) throw new HttpError(403, `El modelo ${model} no está disponible para tu cuenta`);
    }

    const headers: Record<string, string> = { "Content-Type": "application/json", ...t.headers };
    for (const h of PASS_HEADERS) {
      const v = request.headers.get(h);
      if (v) headers[h] = v;
    }
    const upstream = await fetch(t.url, { method: request.method, headers, body, signal: request.signal, redirect: "error" });
    const out = new Headers();
    for (const h of ["content-type", "cache-control", "request-id", "x-request-id"]) {
      const v = upstream.headers.get(h);
      if (v) out.set(h, v);
    }
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch (err) {
    return handleError(err);
  }
}

export { proxy as GET, proxy as POST };
