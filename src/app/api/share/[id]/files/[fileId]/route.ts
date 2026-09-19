import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/**
 * Sirve un adjunto de un chat compartido. Solo entrega archivos que aparecen
 * en la copia compartida, así un enlace público no abre otros archivos.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/share/[id]/files/[fileId]">) {
  const { id, fileId } = await ctx.params;
  const share = await db.query.share.findFirst({ where: eq(schema.share.id, id) });
  const included = share?.messages.some((m) => m.parts.some((p) => p.type === "attachment" && p.attachmentId === fileId));
  if (!share || !included) return new Response("No encontrado", { status: 404 });
  const file = await db.query.attachment.findFirst({ where: eq(schema.attachment.id, fileId) });
  if (!file || file.userId !== share.userId) return new Response("No encontrado", { status: 404 });
  const inline = file.mediaType.startsWith("image/") || file.mediaType === "application/pdf";
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mediaType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
