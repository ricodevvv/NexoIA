import { CreateBucketCommand, DeleteObjectsCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

type Stored = { data: Buffer | null; storageKey: string | null };

let client: S3Client | null = null;
let bucketReady: Promise<void> | null = null;

/**
 * Los adjuntos se guardan en Postgres salvo que STORAGE_DRIVER=s3. En ese caso
 * van a cualquier servicio compatible con S3: AWS, Cloudflare R2, MinIO...
 */
export function usesS3() {
  return process.env.STORAGE_DRIVER === "s3";
}

function s3() {
  client ??= new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
  return client;
}

function bucket() {
  const name = process.env.S3_BUCKET;
  if (!name) throw new Error("Falta S3_BUCKET");
  return name;
}

function ensureBucket() {
  bucketReady ??= s3()
    .send(new HeadBucketCommand({ Bucket: bucket() }))
    .then(() => undefined)
    .catch(async () => {
      await s3().send(new CreateBucketCommand({ Bucket: bucket() }));
    })
    .catch((err) => {
      bucketReady = null;
      throw err;
    });
  return bucketReady;
}

/**
 * Guarda el contenido y devuelve lo que hay que poner en la fila del adjunto.
 */
export async function putFile(key: string, data: Buffer, mediaType: string): Promise<Stored> {
  if (!usesS3()) return { data, storageKey: null };
  await ensureBucket();
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: data, ContentType: mediaType }));
  return { data: null, storageKey: key };
}

/**
 * Lee el contenido de un adjunto, esté en Postgres o en S3.
 */
export async function readFile(row: { data: Buffer | null; storageKey: string | null }): Promise<Buffer> {
  if (row.data) return row.data;
  if (!row.storageKey) throw new Error("El adjunto no tiene contenido");
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: row.storageKey }));
  return Buffer.from(await res.Body!.transformToByteArray());
}

export async function deleteFiles(keys: string[]) {
  if (!keys.length || !usesS3()) return;
  for (let i = 0; i < keys.length; i += 1000) {
    await s3().send(
      new DeleteObjectsCommand({
        Bucket: bucket(),
        Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}
