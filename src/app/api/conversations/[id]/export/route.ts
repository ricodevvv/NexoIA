import { and, eq } from "drizzle-orm";
import { listModels } from "@/lib/ai/models";
import { conversationView } from "@/lib/conversation-view";
import { db, schema } from "@/lib/db";
import { apiUser, handleError, HttpError } from "@/lib/session";

function fileName(title: string) {
  const base = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${base || "chat"}.md`;
}

/**
 * Descarga la rama visible del chat como Markdown: título, fecha y cada
 * mensaje con su autor. Las tools y los adjuntos quedan como notas cortas.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/conversations/[id]/export">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    const conv = await db.query.conversation.findFirst({ where: and(eq(schema.conversation.id, id), eq(schema.conversation.userId, user.id)) });
    if (!conv) throw new HttpError(404, "Conversación no encontrada");
    const rows = await conversationView(id, conv.currentLeafId);
    const labels = new Map(listModels().map((m) => [m.id, m.label]));
    const lines = [`# ${conv.title}`, "", `_Exportado de Nexo el ${new Date().toLocaleString("es")}_`, ""];
    for (const m of rows) {
      const who = m.role === "user" ? "Tú" : `Nexo${m.model ? ` (${labels.get(m.model) ?? m.model})` : ""}`;
      lines.push(`## ${who}`, "");
      for (const part of m.parts) {
        if (part.type === "text") lines.push(part.text, "");
        else if (part.type === "attachment") lines.push(`> Adjunto: ${part.name}`, "");
        else if (part.type === "tool_call") lines.push(`> Herramienta: \`${part.name}\``, "");
        else if (part.type === "notice") lines.push(`> Aviso: ${part.text}`, "");
      }
    }
    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName(conv.title)}"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
