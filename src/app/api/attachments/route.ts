import { nanoid } from "nanoid";
import { isTextLike } from "@/lib/ai/history";
import { db, schema } from "@/lib/db";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { putFile } from "@/lib/storage";
import { apiUser, handleError, HttpError } from "@/lib/session";

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"];

function mediaTypeOf(file: File) {
  if (file.type) return file.type;
  if (/\.(md|txt|csv|log)$/i.test(file.name)) return "text/plain";
  if (/\.json$/i.test(file.name)) return "application/json";
  return "application/octet-stream";
}

export async function POST(request: Request) {
  try {
    const user = await apiUser();
    await enforce([{ key: `upload:u:${user.id}`, ...LIMITS.upload }]);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Falta el archivo");
    if (file.size > MAX_BYTES) throw new HttpError(413, "El archivo pasa de 20 MB");
    const mediaType = mediaTypeOf(file);
    if (!ALLOWED.includes(mediaType) && !isTextLike(mediaType)) {
      throw new HttpError(415, "Tipo de archivo no soportado. Usa imágenes, PDF o archivos de texto.");
    }
    const id = nanoid();
    const stored = await putFile(`${user.id}/${id}`, Buffer.from(await file.arrayBuffer()), mediaType);
    const [row] = await db
      .insert(schema.attachment)
      .values({ id, userId: user.id, name: file.name.slice(0, 200), mediaType, size: file.size, ...stored })
      .returning({ id: schema.attachment.id, name: schema.attachment.name, mediaType: schema.attachment.mediaType });
    return Response.json(row);
  } catch (err) {
    return handleError(err);
  }
}
