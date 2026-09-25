import { nanoid } from "nanoid";
import { db, schema } from "@/lib/db";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { handleError, HttpError } from "@/lib/session";
import { putFile } from "@/lib/storage";
import { workspaceFromRequest } from "@/lib/workspaces";

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 10;

const BY_EXTENSION: Record<string, string> = {
  jar: "application/java-archive",
  zip: "application/zip",
  gz: "application/gzip",
  tar: "application/x-tar",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  json: "application/json",
  md: "text/markdown",
  txt: "text/plain",
  csv: "text/csv",
  html: "text/html",
};

/**
 * Recibe los archivos que el agente de un espacio de trabajo le presenta al
 * usuario. Se autentica con el token del espacio y se guardan como adjuntos
 * del dueño, así aparecen en el chat para descargar.
 */
export async function POST(request: Request) {
  try {
    const row = await workspaceFromRequest(request);
    await enforce([{ key: `upload:u:${row.userId}`, ...LIMITS.upload }]);

    const form = await request.formData();
    const files = form.getAll("file").filter((f): f is File => f instanceof File);
    if (!files.length) throw new HttpError(400, "No llegó ningún archivo");
    if (files.length > MAX_FILES) throw new HttpError(400, `Máximo ${MAX_FILES} archivos por vez`);

    const saved = [];
    for (const file of files) {
      if (file.size > MAX_BYTES) throw new HttpError(413, `${file.name} pasa de 50 MB`);
      const name = file.name.split(/[\\/]/).pop()!.slice(0, 200) || "archivo";
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      const mediaType = BY_EXTENSION[ext] ?? "application/octet-stream";
      const id = nanoid();
      const stored = await putFile(`${row.userId}/${id}`, Buffer.from(await file.arrayBuffer()), mediaType);
      await db.insert(schema.attachment).values({ id, userId: row.userId, name, mediaType, size: file.size, ...stored });
      saved.push({ attachmentId: id, name, mediaType });
    }
    return Response.json({ files: saved });
  } catch (err) {
    return handleError(err);
  }
}
