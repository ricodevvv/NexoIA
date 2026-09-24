import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { sharedAttachmentIds } from "@/lib/projects";
import { fileHeaders } from "@/lib/file-headers";
import { readFile } from "@/lib/storage";
import { apiUser, handleError, HttpError } from "@/lib/session";

export async function GET(_request: Request, ctx: RouteContext<"/api/attachments/[id]">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    const row = await db.query.attachment.findFirst({ where: eq(schema.attachment.id, id) });
    if (!row || (row.userId !== user.id && !(await sharedAttachmentIds(user.id, [id])).has(id))) {
      throw new HttpError(404, "Archivo no encontrado");
    }
    return new Response(new Uint8Array(await readFile(row)), { headers: fileHeaders(row.mediaType, row.name, "private, max-age=86400") });
  } catch (err) {
    return handleError(err);
  }
}
