import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { apiUser, handleError } from "@/lib/session";

type Result = { id: string; title: string; updatedAt: Date; snippet: string | null };

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function snippetOf(texts: string[], q: string) {
  const needle = q.toLowerCase();
  for (const text of texts) {
    const i = text.toLowerCase().indexOf(needle);
    if (i === -1) continue;
    const start = Math.max(0, i - 60);
    const end = Math.min(text.length, i + q.length + 90);
    return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
  }
  return null;
}

/**
 * Busca en los títulos y en el texto de todos los mensajes del usuario.
 */
export async function GET(request: Request) {
  try {
    const user = await apiUser();
    const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) ?? "";
    if (q.length < 2) return Response.json([]);
    const pattern = `%${escapeLike(q)}%`;
    const texts = sql<string[]>`jsonb_path_query_array(${schema.message.parts}, '$[*] ? (@.type == "text").text')`;

    const [byTitle, byContent] = await Promise.all([
      db
        .select({ id: schema.conversation.id, title: schema.conversation.title, updatedAt: schema.conversation.updatedAt })
        .from(schema.conversation)
        .where(and(eq(schema.conversation.userId, user.id), ilike(schema.conversation.title, pattern)))
        .orderBy(desc(schema.conversation.updatedAt))
        .limit(20),
      db
        .select({
          id: schema.conversation.id,
          title: schema.conversation.title,
          updatedAt: schema.conversation.updatedAt,
          texts,
        })
        .from(schema.message)
        .innerJoin(schema.conversation, eq(schema.conversation.id, schema.message.conversationId))
        .where(and(eq(schema.conversation.userId, user.id), sql`${texts}::text ilike ${pattern}`))
        .orderBy(desc(schema.conversation.updatedAt))
        .limit(200),
    ]);

    const results = new Map<string, Result>();
    for (const row of byContent) {
      if (results.has(row.id)) continue;
      results.set(row.id, { id: row.id, title: row.title, updatedAt: row.updatedAt, snippet: snippetOf(row.texts, q) });
    }
    for (const row of byTitle) {
      if (!results.has(row.id)) results.set(row.id, { ...row, snippet: null });
    }
    const list = [...results.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 30);
    return Response.json(list);
  } catch (err) {
    return handleError(err);
  }
}
