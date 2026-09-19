import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/lib/db";
import type { SharedMessage } from "@/lib/db/schema";
import { apiUser, handleError, HttpError } from "@/lib/session";

async function ownedConversation(userId: string, id: string) {
  const conv = await db.query.conversation.findFirst({
    where: and(eq(schema.conversation.id, id), eq(schema.conversation.userId, userId)),
  });
  if (!conv) throw new HttpError(404, "Conversación no encontrada");
  return conv;
}

export async function GET(_request: Request, ctx: RouteContext<"/api/conversations/[id]/share">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    await ownedConversation(user.id, id);
    const row = await db.query.share.findFirst({ where: eq(schema.share.conversationId, id) });
    return Response.json(row ? { id: row.id, createdAt: row.createdAt } : null);
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Crea o actualiza el enlace público. Guarda una copia de los mensajes tal como
 * están ahora; lo que se escriba después no aparece hasta volver a compartir.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/conversations/[id]/share">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    const conv = await ownedConversation(user.id, id);
    const rows = await db
      .select({ role: schema.message.role, parts: schema.message.parts, model: schema.message.model })
      .from(schema.message)
      .where(eq(schema.message.conversationId, id))
      .orderBy(asc(schema.message.createdAt));
    if (!rows.length) throw new HttpError(400, "No hay nada que compartir todavía");
    const messages: SharedMessage[] = rows.map((m) => ({
      role: m.role,
      model: m.model,
      parts: m.parts.filter((p) => p.type !== "reasoning"),
    }));
    const existing = await db.query.share.findFirst({ where: eq(schema.share.conversationId, id) });
    if (existing) {
      await db
        .update(schema.share)
        .set({ title: conv.title, messages, createdAt: new Date() })
        .where(eq(schema.share.id, existing.id));
      return Response.json({ id: existing.id });
    }
    const shareId = nanoid(16);
    await db.insert(schema.share).values({ id: shareId, userId: user.id, conversationId: id, title: conv.title, messages });
    return Response.json({ id: shareId });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/conversations/[id]/share">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    await db.delete(schema.share).where(and(eq(schema.share.conversationId, id), eq(schema.share.userId, user.id)));
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
