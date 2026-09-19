import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { connectServer } from "@/lib/mcp";
import { apiUser, handleError, HttpError } from "@/lib/session";

function owned(userId: string, id: string) {
  return and(eq(schema.mcpServer.id, id), eq(schema.mcpServer.userId, userId));
}

export async function GET(_request: Request, ctx: RouteContext<"/api/mcp/[id]">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    const row = await db.query.mcpServer.findFirst({ where: owned(user.id, id) });
    if (!row) throw new HttpError(404, "Servidor no encontrado");
    try {
      const client = await connectServer(row);
      const { tools } = await client.listTools();
      await client.close();
      return Response.json({ ok: true, tools: tools.map((t) => ({ name: t.name, description: t.description ?? "" })) });
    } catch (e) {
      return Response.json({ ok: false, error: (e as Error).message });
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
    await db.update(schema.mcpServer).set({ enabled }).where(owned(user.id, id));
    return Response.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/mcp/[id]">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    await db.delete(schema.mcpServer).where(owned(user.id, id));
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
