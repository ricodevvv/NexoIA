import { and, desc, eq, ilike, lt } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { db, schema } from "@/lib/db";
import { apiUser, handleError } from "@/lib/session";

const TEMPORARY_TTL_MS = 24 * 3600 * 1000;

/**
 * Lista los chats del usuario. Por defecto deja fuera los archivados y los
 * temporales; con `?archived=1` devuelve solo los archivados. De paso borra
 * los chats temporales de más de un día.
 */
export async function GET(request: Request) {
  try {
    const user = await apiUser();
    const params = new URL(request.url).searchParams;
    const q = params.get("q")?.trim();
    const archived = params.get("archived") === "1";
    await db
      .delete(schema.conversation)
      .where(
        and(
          eq(schema.conversation.userId, user.id),
          eq(schema.conversation.temporary, true),
          lt(schema.conversation.updatedAt, new Date(Date.now() - TEMPORARY_TTL_MS)),
        ),
      );
    const rows = await db
      .select({
        id: schema.conversation.id,
        title: schema.conversation.title,
        starred: schema.conversation.starred,
        archived: schema.conversation.archived,
        projectId: schema.conversation.projectId,
        updatedAt: schema.conversation.updatedAt,
      })
      .from(schema.conversation)
      .where(
        and(
          eq(schema.conversation.userId, user.id),
          eq(schema.conversation.temporary, false),
          eq(schema.conversation.archived, archived),
          q ? ilike(schema.conversation.title, `%${q.replace(/[%_]/g, "\\$&")}%`) : undefined,
        ),
      )
      .orderBy(desc(schema.conversation.updatedAt))
      .limit(archived ? 500 : 300);
    return Response.json(rows);
  } catch (err) {
    return handleError(err);
  }
}

const Bulk = z.object({ scope: z.enum(["all", "archived"]) });

/**
 * Borra en bloque: todos los chats o solo los archivados.
 */
export async function DELETE(request: Request) {
  try {
    const user = await apiUser();
    const { scope } = Bulk.parse(await request.json());
    const removed = await db
      .delete(schema.conversation)
      .where(and(eq(schema.conversation.userId, user.id), scope === "archived" ? eq(schema.conversation.archived, true) : undefined))
      .returning({ id: schema.conversation.id });
    await audit({ userId: user.id, action: "conversations.deleted", metadata: { scope, count: removed.length }, headers: request.headers });
    return Response.json({ deleted: removed.length });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Petición inválida" }, { status: 400 });
    return handleError(err);
  }
}
