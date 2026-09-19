import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { apiUser, handleError } from "@/lib/session";

export async function GET() {
  try {
    const user = await apiUser();
    const rows = await db
      .select({
        id: schema.share.id,
        conversationId: schema.share.conversationId,
        title: schema.share.title,
        createdAt: schema.share.createdAt,
      })
      .from(schema.share)
      .where(eq(schema.share.userId, user.id))
      .orderBy(desc(schema.share.createdAt));
    return Response.json(rows);
  } catch (err) {
    return handleError(err);
  }
}
