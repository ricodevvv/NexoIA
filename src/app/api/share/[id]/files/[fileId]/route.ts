import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { clientIp, consume, LIMITS } from "@/lib/rate-limit";
import { fileHeaders } from "@/lib/file-headers";
import { readFile } from "@/lib/storage";

/**
 * Sirve un adjunto de un chat compartido. Solo entrega archivos que aparecen
 * en la copia compartida, así un enlace público no abre otros archivos.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/share/[id]/files/[fileId]">) {
  const { id, fileId } = await ctx.params;
  const limit = await consume(`share:ip:${clientIp(request.headers)}`, LIMITS.share);
  if (!limit.allowed) return new Response("Demasiadas peticiones", { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const share = await db.query.share.findFirst({ where: eq(schema.share.id, id) });
  const included = share?.messages.some((m) => m.parts.some((p) => p.type === "attachment" && p.attachmentId === fileId));
  if (!share || !included) return new Response("No encontrado", { status: 404 });
  const file = await db.query.attachment.findFirst({ where: eq(schema.attachment.id, fileId) });
  if (!file || file.userId !== share.userId) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(await readFile(file)), { headers: fileHeaders(file.mediaType, file.name, "public, max-age=3600") });
}
