import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { apiUser, handleError, HttpError } from "@/lib/session";

/**
 * Guarda el 👍 o 👎 de una respuesta. `null` lo quita.
 */
export async function PUT(request: Request, ctx: RouteContext<"/api/messages/[id]/feedback">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    const { value } = z.object({ value: z.enum(["up", "down"]).nullable() }).parse(await request.json());
    const [row] = await db
      .select({ userId: schema.conversation.userId, role: schema.message.role })
      .from(schema.message)
      .innerJoin(schema.conversation, eq(schema.conversation.id, schema.message.conversationId))
      .where(eq(schema.message.id, id))
      .limit(1);
    if (!row || row.userId !== user.id || row.role !== "assistant") throw new HttpError(404, "Mensaje no encontrado");
    await db.update(schema.message).set({ feedback: value }).where(eq(schema.message.id, id));
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Datos inválidos" }, { status: 400 });
    return handleError(err);
  }
}
