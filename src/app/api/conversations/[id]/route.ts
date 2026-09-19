import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { apiUser, handleError, HttpError } from "@/lib/session";

const Patch = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  starred: z.boolean().optional(),
});

function owned(userId: string, id: string) {
  return and(eq(schema.conversation.id, id), eq(schema.conversation.userId, userId));
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    const data = Patch.parse(await request.json());
    const [row] = await db.update(schema.conversation).set(data).where(owned(user.id, id)).returning();
    if (!row) throw new HttpError(404, "Conversación no encontrada");
    return Response.json({ id: row.id, title: row.title, starred: row.starred });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    await db.delete(schema.conversation).where(owned(user.id, id));
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
