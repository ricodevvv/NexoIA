import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { conversationView, switchBranch } from "@/lib/conversation-view";
import { db, schema } from "@/lib/db";
import { apiUser, handleError, HttpError } from "@/lib/session";

async function owned(userId: string, id: string) {
  const conv = await db.query.conversation.findFirst({
    where: and(eq(schema.conversation.id, id), eq(schema.conversation.userId, userId)),
  });
  if (!conv) throw new HttpError(404, "Conversación no encontrada");
  return conv;
}

export async function GET(_request: Request, ctx: RouteContext<"/api/conversations/[id]/branch">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    const conv = await owned(user.id, id);
    return Response.json(await conversationView(id, conv.currentLeafId));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request, ctx: RouteContext<"/api/conversations/[id]/branch">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    await owned(user.id, id);
    const { messageId } = z.object({ messageId: z.string() }).parse(await request.json());
    const view = await switchBranch(id, messageId);
    if (!view) throw new HttpError(404, "Mensaje no encontrado");
    return Response.json(view);
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Datos inválidos" }, { status: 400 });
    return handleError(err);
  }
}
