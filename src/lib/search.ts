import { and, desc, eq, ilike, ne, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export type SearchResult = { id: string; title: string; updatedAt: Date; snippet: string | null };

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function snippetOf(texts: string[], q: string, radius = 90) {
  const needle = q.toLowerCase();
  for (const text of texts) {
    const i = text.toLowerCase().indexOf(needle);
    if (i === -1) continue;
    const start = Math.max(0, i - radius / 1.5);
    const end = Math.min(text.length, i + q.length + radius);
    return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
  }
  return null;
}

/**
 * Busca en los títulos y en el texto de todos los mensajes del usuario, de lo
 * más reciente a lo más viejo. `exclude` deja fuera una conversación (la
 * actual, cuando la usa el modelo).
 */
export async function searchConversations(userId: string, query: string, opts: { limit?: number; exclude?: string; radius?: number } = {}) {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];
  const pattern = `%${escapeLike(q)}%`;
  const texts = sql<string[]>`jsonb_path_query_array(${schema.message.parts}, '$[*] ? (@.type == "text").text')`;
  const mine = and(
    eq(schema.conversation.userId, userId),
    opts.exclude ? ne(schema.conversation.id, opts.exclude) : undefined,
  );

  const [byTitle, byContent] = await Promise.all([
    db
      .select({ id: schema.conversation.id, title: schema.conversation.title, updatedAt: schema.conversation.updatedAt })
      .from(schema.conversation)
      .where(and(mine, ilike(schema.conversation.title, pattern)))
      .orderBy(desc(schema.conversation.updatedAt))
      .limit(20),
    db
      .select({ id: schema.conversation.id, title: schema.conversation.title, updatedAt: schema.conversation.updatedAt, texts })
      .from(schema.message)
      .innerJoin(schema.conversation, eq(schema.conversation.id, schema.message.conversationId))
      .where(and(mine, sql`${texts}::text ilike ${pattern}`))
      .orderBy(desc(schema.conversation.updatedAt))
      .limit(200),
  ]);

  const results = new Map<string, SearchResult>();
  for (const row of byContent) {
    if (!results.has(row.id)) results.set(row.id, { id: row.id, title: row.title, updatedAt: row.updatedAt, snippet: snippetOf(row.texts, q, opts.radius) });
  }
  for (const row of byTitle) {
    if (!results.has(row.id)) results.set(row.id, { ...row, snippet: null });
  }
  return [...results.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, opts.limit ?? 30);
}
