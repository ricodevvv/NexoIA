import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { sharedAttachmentIds } from "@/lib/projects";
import { apiUser, handleError, HttpError } from "@/lib/session";

export async function GET(_request: Request, ctx: RouteContext<"/api/attachments/[id]">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    const row = await db.query.attachment.findFirst({ where: eq(schema.attachment.id, id) });
    if (!row || (row.userId !== user.id && !(await sharedAttachmentIds(user.id, [id])).has(id))) {
      throw new HttpError(404, "Archivo no encontrado");
    }
    const inline = row.mediaType.startsWith("image/") || row.mediaType === "application/pdf";
    return new Response(new Uint8Array(row.data), {
      headers: {
        "Content-Type": row.mediaType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
