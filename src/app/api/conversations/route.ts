import { and, desc, eq, ilike } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { apiUser, handleError } from "@/lib/session";

export async function GET(request: Request) {
  try {
    const user = await apiUser();
    const q = new URL(request.url).searchParams.get("q")?.trim();
    const rows = await db
      .select({
        id: schema.conversation.id,
        title: schema.conversation.title,
        starred: schema.conversation.starred,
        updatedAt: schema.conversation.updatedAt,
      })
      .from(schema.conversation)
      .where(
        and(
          eq(schema.conversation.userId, user.id),
          q ? ilike(schema.conversation.title, `%${q.replace(/[%_]/g, "\\$&")}%`) : undefined,
        ),
      )
      .orderBy(desc(schema.conversation.updatedAt))
      .limit(200);
    return Response.json(rows);
  } catch (err) {
    return handleError(err);
  }
}
