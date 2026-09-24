import { nanoid } from "nanoid";
import { db, schema } from "@/lib/db";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { putFile } from "@/lib/storage";
import { apiUser, handleError, HttpError } from "@/lib/session";

const MAX_BYTES = 20 * 1024 * 1024;
const BY_EXTENSION: Record<string, string> = {
  md: "text/markdown",
  txt: "text/plain",
  csv: "text/csv",
  log: "text/plain",
  json: "application/json",
  zip: "application/zip",
  tar: "application/x-tar",
  gz: "application/gzip",
  tgz: "application/gzip",
  "7z": "application/x-7z-compressed",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/**
 * Tipo del archivo: el que manda el navegador o, si viene vacío o genérico,
 * el que corresponde a la extensión.
 */
function mediaTypeOf(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (file.type && file.type !== "application/octet-stream") return file.type;
  return BY_EXTENSION[ext] ?? (/^(py|js|ts|tsx|jsx|java|kt|go|rs|rb|php|c|cpp|h|cs|swift|sql|sh|yml|yaml|toml|xml|html|css)$/.test(ext) ? "text/plain" : "application/octet-stream");
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
