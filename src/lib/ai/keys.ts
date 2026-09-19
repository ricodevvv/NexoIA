import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import type { ProviderId } from "./types";

const ENV_KEYS: Record<ProviderId, string | undefined> = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  compat: process.env.COMPAT_API_KEY,
};

export type ResolvedKey = { apiKey: string; byok: boolean };

/**
 * Decide qué API key usar: primero la del usuario (BYOK), si no la global del
 * servidor. Devuelve null si no hay ninguna.
 */
export async function resolveKey(userId: string, provider: ProviderId): Promise<ResolvedKey | null> {
  if (provider !== "compat") {
    const row = await db.query.apiKey.findFirst({
      where: and(eq(schema.apiKey.userId, userId), eq(schema.apiKey.provider, provider)),
    });
    if (row) return { apiKey: decrypt(row.secret), byok: true };
  }
  const env = ENV_KEYS[provider];
  if (env) return { apiKey: env, byok: false };
  if (provider === "compat" && process.env.COMPAT_BASE_URL) return { apiKey: "", byok: false };
  return null;
}
