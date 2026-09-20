import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSettings, listMemories } from "@/lib/settings";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { apiUser, handleError } from "@/lib/session";

/**
 * Descarga todo lo del usuario en un JSON: perfil, ajustes, memoria, proyectos,
 * estilos y conversaciones. No incluye secretos (API keys, headers de MCP) ni
 * el contenido binario de los adjuntos, solo sus datos.
 */
export async function GET() {
  try {
    const user = await apiUser();
    await enforce([{ key: `export:u:${user.id}`, ...LIMITS.export }]);
    const [conversations, projects, styles, servers, files, settings, memories] = await Promise.all([
      db.query.conversation.findMany({ where: eq(schema.conversation.userId, user.id), orderBy: asc(schema.conversation.createdAt) }),
      db.query.project.findMany({ where: eq(schema.project.userId, user.id), orderBy: asc(schema.project.createdAt) }),
      db
        .select({ name: schema.responseStyle.name, instructions: schema.responseStyle.instructions })
        .from(schema.responseStyle)
        .where(eq(schema.responseStyle.userId, user.id)),
      db
        .select({ name: schema.mcpServer.name, url: schema.mcpServer.url, enabled: schema.mcpServer.enabled })
        .from(schema.mcpServer)
        .where(eq(schema.mcpServer.userId, user.id)),
      db
        .select({
          id: schema.attachment.id,
          name: schema.attachment.name,
          mediaType: schema.attachment.mediaType,
          size: schema.attachment.size,
          createdAt: schema.attachment.createdAt,
        })
        .from(schema.attachment)
        .where(eq(schema.attachment.userId, user.id)),
      getSettings(user.id),
      listMemories(user.id),
    ]);

    const ids = conversations.map((c) => c.id);
    const messages = ids.length
      ? await db
          .select({
            conversationId: schema.message.conversationId,
            role: schema.message.role,
            parts: schema.message.parts,
            model: schema.message.model,
            createdAt: schema.message.createdAt,
          })
          .from(schema.message)
          .where(inArray(schema.message.conversationId, ids))
          .orderBy(asc(schema.message.createdAt))
      : [];
    const projectFiles = projects.length
      ? await db
          .select()
          .from(schema.projectFile)
          .where(inArray(schema.projectFile.projectId, projects.map((p) => p.id)))
      : [];

    const data = {
      exportedAt: new Date().toISOString(),
      user: { name: user.name, email: user.email, createdAt: user.createdAt },
      settings,
      memories: memories.map((m) => ({ content: m.content, createdAt: m.createdAt })),
      styles,
      connectors: servers,
      attachments: files,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        instructions: p.instructions,
        files: projectFiles.filter((f) => f.projectId === p.id).map((f) => f.attachmentId),
        createdAt: p.createdAt,
      })),
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        projectId: c.projectId,
        createdAt: c.createdAt,
        messages: messages
          .filter((m) => m.conversationId === c.id)
          .map((m) => ({ role: m.role, model: m.model, createdAt: m.createdAt, parts: m.parts })),
      })),
    };

    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="nexo-export-${date}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
