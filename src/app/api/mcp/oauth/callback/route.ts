import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logError } from "@/lib/log";
import { DbOAuthProvider } from "@/lib/mcp-oauth";
import { safeFetch } from "@/lib/safe-url";
import { getUser } from "@/lib/session";
import { canManage, membership } from "@/lib/workspace";

function back(request: Request, workspace: boolean, params: Record<string, string>) {
  const url = new URL(workspace ? "/workspace" : "/settings", request.url);
  url.searchParams.set("tab", "connectors");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return Response.redirect(url, 303);
}

/**
 * A donde vuelve el usuario después de autorizar en el servicio. Busca el
 * conector por el `state`, comprueba que sea de quien tiene la sesión y
 * cambia el código por tokens.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const code = params.get("code");
  const user = await getUser();
  if (!user) return Response.redirect(new URL("/login", request.url), 303);
  if (!state) return back(request, false, { oauth: "error", reason: "Falta el estado de la autorización" });

  const row = await db.query.mcpServer.findFirst({ where: eq(schema.mcpServer.oauthState, state) });
  if (!row) return back(request, false, { oauth: "error", reason: "La autorización venció o ya se usó" });
  const workspace = Boolean(row.organizationId);
  const allowed = row.organizationId
    ? canManage((await membership(user.id, row.organizationId))?.role)
    : row.userId === user.id;
  if (!allowed) return back(request, workspace, { oauth: "error", reason: "Ese conector no es tuyo" });

  await db.update(schema.mcpServer).set({ oauthState: null }).where(eq(schema.mcpServer.id, row.id));
  const denied = params.get("error");
  if (denied || !code) return back(request, workspace, { oauth: "error", reason: params.get("error_description") ?? "Cancelaste la autorización" });

  try {
    const provider = new DbOAuthProvider(row);
    await auth(provider, { serverUrl: row.url, authorizationCode: code, fetchFn: safeFetch });
    return back(request, workspace, { oauth: "ok", name: row.name });
  } catch (err) {
    logError("mcp-oauth", err, { server: row.id });
    return back(request, workspace, { oauth: "error", reason: "No se pudo completar la autorización" });
  }
}
