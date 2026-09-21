import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { MessagePart } from "@/lib/ai/types";
import { defaultLeaf, latestLeaf, pathTo, siblingsOf, type Siblings } from "./branches";

export type ViewMessage = {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  model: string | null;
  createdAt: string;
  feedback: "up" | "down" | null;
  siblings?: Siblings;
};

async function loadTree(conversationId: string) {
  return db
    .select({
      id: schema.message.id,
      parentId: schema.message.parentId,
      role: schema.message.role,
      parts: schema.message.parts,
      model: schema.message.model,
      feedback: schema.message.feedback,
      createdAt: schema.message.createdAt,
    })
    .from(schema.message)
    .where(eq(schema.message.conversationId, conversationId))
    .orderBy(asc(schema.message.createdAt));
}

/**
 * Los mensajes de la rama activa, cada uno con sus versiones alternativas.
 */
export async function conversationView(conversationId: string, currentLeafId: string | null): Promise<ViewMessage[]> {
  const tree = await loadTree(conversationId);
  const leaf = currentLeafId && tree.some((m) => m.id === currentLeafId) ? currentLeafId : defaultLeaf(tree);
  const path = pathTo(tree, leaf);
  const siblings = siblingsOf(tree, path);
  return path.map((m) => ({
    id: m.id,
    role: m.role,
    parts: m.parts,
    model: m.model,
    createdAt: m.createdAt.toISOString(),
    feedback: m.feedback,
    ...(siblings.has(m.id) ? { siblings: siblings.get(m.id) } : {}),
  }));
}

/**
 * Cambia la rama activa a la versión `messageId` (y lo más reciente que cuelga
 * de ella). Devuelve la nueva vista.
 */
export async function switchBranch(conversationId: string, messageId: string) {
  const tree = await loadTree(conversationId);
  if (!tree.some((m) => m.id === messageId)) return null;
  const leaf = latestLeaf(tree, messageId);
  await db.update(schema.conversation).set({ currentLeafId: leaf }).where(eq(schema.conversation.id, conversationId));
  return conversationView(conversationId, leaf);
}
