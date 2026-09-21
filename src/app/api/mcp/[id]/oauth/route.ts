import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { DbOAuthProvider } from "@/lib/mcp-oauth";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { safeFetch } from "@/lib/safe-url";
import { apiUser, handleError, HttpError } from "@/lib/session";
import { canManage, membership } from "@/lib/workspace";

/**
 * Empieza la autorización OAuth de un conector. Devuelve la URL del servicio a
 * la que hay que mandar al usuario, o `authorized` si ya tenía tokens válidos.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/mcp/[id]/oauth">) {
  try {
    const user = await apiUser();
    await enforce([{ key: `mcp:u:${user.id}`, ...LIMITS.connector }]);
    const { id } = await ctx.params;
    const row = await db.query.mcpServer.findFirst({ where: eq(schema.mcpServer.id, id) });
    if (!row) throw new HttpError(404, "Conector no encontrado");
    if (row.organizationId) {
      const member = await membership(user.id, row.organizationId);
      if (!member || !canManage(member.role)) throw new HttpError(403, "Solo los admins del equipo autorizan sus conectores");
    } else if (row.userId !== user.id) {
      throw new HttpError(404, "Conector no encontrado");
    }
    if (row.authType !== "oauth") throw new HttpError(400, "Este conector no usa OAuth");

    const provider = new DbOAuthProvider(row);
    try {
      const result = await auth(provider, { serverUrl: row.url, fetchFn: safeFetch });
      if (result === "AUTHORIZED") return Response.json({ authorized: true });
    } catch (err) {
      throw new HttpError(502, `El servicio no aceptó la autorización: ${(err as Error).message}`);
    }
    if (!provider.authorizationUrl) throw new HttpError(502, "El servicio no devolvió una página de autorización");
    return Response.json({ url: provider.authorizationUrl.href });
  } catch (err) {
    return handleError(err);
  }
}
