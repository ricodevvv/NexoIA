import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { connectServer, NeedsAuthorization } from "@/lib/mcp";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { apiUser, handleError, HttpError } from "@/lib/session";
import { canManage, membership } from "@/lib/workspace";

/**
 * Busca el conector y valida permisos: los personales solo los toca su dueño;
 * los de equipo los prueba cualquier miembro y los cambian solo los admins.
 */
async function accessible(userId: string, id: string, write: boolean) {
  const row = await db.query.mcpServer.findFirst({ where: eq(schema.mcpServer.id, id) });
  if (!row) throw new HttpError(404, "Servidor no encontrado");
  if (!row.organizationId) {
    if (row.userId !== userId) throw new HttpError(404, "Servidor no encontrado");
    return row;
  }
  const member = await membership(userId, row.organizationId);
  if (!member) throw new HttpError(404, "Servidor no encontrado");
  if (write && !canManage(member.role)) throw new HttpError(403, "Solo los admins del equipo manejan sus conectores");
  return row;
}

export async function GET(_request: Request, ctx: RouteContext<"/api/mcp/[id]">) {
  try {
    const user = await apiUser();
    await enforce([{ key: `mcp:u:${user.id}`, ...LIMITS.connector }]);
    const { id } = await ctx.params;
    const row = await accessible(user.id, id, false);
    try {
      const client = await connectServer(row);
      const { tools } = await client.listTools();
      await client.close();
      return Response.json({ ok: true, tools: tools.map((t) => ({ name: t.name, description: t.description ?? "" })) });
    } catch (e) {
      return Response.json({ ok: false, needsAuth: e instanceof NeedsAuthorization, error: (e as Error).message });
    }
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/mcp/[id]">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    const { enabled } = z.object({ enabled: z.boolean() }).parse(await request.json());
    await accessible(user.id, id, true);
    await db.update(schema.mcpServer).set({ enabled }).where(eq(schema.mcpServer.id, id));
    return Response.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/mcp/[id]">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    await accessible(user.id, id, true);
    await db.delete(schema.mcpServer).where(eq(schema.mcpServer.id, id));
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
