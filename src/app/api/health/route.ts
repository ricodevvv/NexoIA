import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { sql } from "drizzle-orm";
import { codeExecutionEnabled } from "@/lib/code-exec";
import { db } from "@/lib/db";
import { usesS3 } from "@/lib/storage";

const started = Date.now();

async function check(fn: () => Promise<unknown>) {
  const t = Date.now();
  try {
    await fn();
    return { ok: true, ms: Date.now() - t };
  } catch {
    return { ok: false, ms: Date.now() - t };
  }
}

/**
 * Estado del servicio para monitoreo: base de datos y almacenamiento. Responde
 * 503 si algo esencial falla. No expone detalles de configuración.
 */
export async function GET() {
  const database = await check(() => db.execute(sql`select 1`));
  const storage = usesS3()
    ? await check(async () => {
        const { S3Client } = await import("@aws-sdk/client-s3");
        const client = new S3Client({
          region: process.env.S3_REGION || "auto",
          endpoint: process.env.S3_ENDPOINT || undefined,
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
          credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
        });
        await client.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET! }));
      })
    : { ok: true, ms: 0 };
  const ok = database.ok && storage.ok;
  return Response.json(
    {
      status: ok ? "ok" : "degradado",
      database,
      storage: { driver: usesS3() ? "s3" : "postgres", ...storage },
      codeExecution: codeExecutionEnabled(),
      uptimeSeconds: Math.round((Date.now() - started) / 1000),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
