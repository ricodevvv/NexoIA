import { createHash, randomBytes } from "node:crypto";
import { and, count, desc, eq, gte, isNull, sql, sum } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/lib/db";
import { HttpError } from "@/lib/http";

export const KEY_PREFIX = "nexo-sk-";
const MAX_ACTIVE_KEYS = 25;

export function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Genera una key nueva. Solo se muestra completa una vez; en la base queda
 * el hash y un pedacito para reconocerla.
 */
export function generateKey() {
  const key = `${KEY_PREFIX}${randomBytes(30).toString("base64url")}`;
  return { key, hash: hashKey(key), prefix: `${key.slice(0, 12)}…${key.slice(-4)}` };
}

export type PlatformKeyView = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  requests: number;
  tokens: number;
};

/**
 * Las keys del usuario con cuántas peticiones y tokens llevan en 30 días.
 */
export async function listKeys(userId: string): Promise<PlatformKeyView[]> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [keys, stats] = await Promise.all([
    db.query.platformKey.findMany({ where: eq(schema.platformKey.userId, userId), orderBy: desc(schema.platformKey.createdAt) }),
    db
      .select({
        keyId: schema.usage.apiKeyId,
        requests: count(),
        tokens: sql<number>`coalesce(${sum(schema.usage.inputTokens)}, 0) + coalesce(${sum(schema.usage.outputTokens)}, 0)`.mapWith(Number),
      })
      .from(schema.usage)
      .where(and(eq(schema.usage.userId, userId), gte(schema.usage.createdAt, since)))
      .groupBy(schema.usage.apiKeyId),
  ]);
  const byKey = new Map(stats.map((s) => [s.keyId, s]));
  return keys.map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    expiresAt: k.expiresAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
    requests: byKey.get(k.id)?.requests ?? 0,
    tokens: byKey.get(k.id)?.tokens ?? 0,
  }));
}

export async function createKey(userId: string, name: string, expiresInDays: number | null) {
  const [active] = await db
    .select({ n: count() })
    .from(schema.platformKey)
    .where(and(eq(schema.platformKey.userId, userId), isNull(schema.platformKey.revokedAt)));
  if ((active?.n ?? 0) >= MAX_ACTIVE_KEYS) throw new HttpError(400, `Puedes tener hasta ${MAX_ACTIVE_KEYS} keys activas. Revoca alguna primero.`);
  const { key, hash, prefix } = generateKey();
  const [row] = await db
    .insert(schema.platformKey)
    .values({
      id: nanoid(),
      userId,
      name,
      prefix,
      hash,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : null,
    })
    .returning();
  return { key, row };
}

export async function revokeKey(userId: string, id: string) {
  const [row] = await db
    .update(schema.platformKey)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.platformKey.id, id), eq(schema.platformKey.userId, userId), isNull(schema.platformKey.revokedAt)))
    .returning();
  if (!row) throw new HttpError(404, "Key no encontrada");
  return row;
}

/**
 * Saca la key de `Authorization: Bearer` o de `x-api-key`.
 */
export function keyFromHeaders(headers: Headers) {
  const bearer = headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || headers.get("x-api-key")?.trim() || null;
}

/**
 * Valida una key de la API de Nexo y devuelve a quién pertenece. Marca el
 * último uso como mucho una vez por minuto para no escribir en cada petición.
 */
export async function authenticateKey(headers: Headers) {
  const key = keyFromHeaders(headers);
  if (!key) throw new HttpError(401, "Falta la API key. Mándala en el header Authorization: Bearer nexo-sk-…");
  if (!key.startsWith(KEY_PREFIX)) throw new HttpError(401, "La API key no es de Nexo.");
  const row = await db.query.platformKey.findFirst({ where: eq(schema.platformKey.hash, hashKey(key)) });
  if (!row || row.revokedAt) throw new HttpError(401, "La API key no es válida o fue revocada.");
  if (row.expiresAt && row.expiresAt < new Date()) throw new HttpError(401, "La API key expiró.");
  const user = await db.query.user.findFirst({ where: eq(schema.user.id, row.userId) });
  if (!user) throw new HttpError(401, "La API key no es válida.");
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db.update(schema.platformKey).set({ lastUsedAt: new Date() }).where(eq(schema.platformKey.id, row.id));
  }
  return { user, key: row };
}
