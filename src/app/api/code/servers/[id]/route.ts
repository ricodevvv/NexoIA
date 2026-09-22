import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { apiUser, handleError, HttpError } from "@/lib/session";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/code/servers/[id]">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    const deleted = await db
      .delete(schema.codeServer)
      .where(and(eq(schema.codeServer.id, id), eq(schema.codeServer.userId, user.id)))
      .returning({ id: schema.codeServer.id });
    if (!deleted.length) throw new HttpError(404, "No encontré ese servidor");
    return Response.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
