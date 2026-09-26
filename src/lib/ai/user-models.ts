import { and, asc, eq } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import { resolveKey, type ResolvedKey } from "./keys";
import { findModel } from "./models";
import type { ModelInfo } from "./types";

type EndpointRow = typeof schema.userEndpoint.$inferSelect;

function shortName(model: string) {
  return model.split("/").at(-1) ?? model;
}

function toModels(row: EndpointRow): ModelInfo[] {
  return row.models.map((model) => ({
    id: `ep:${row.id}:${model}`,
    provider: "compat",
    label: shortName(model),
    description: model,
    tier: "free",
    vision: false,
    pdf: false,
    reasoning: "compat",
    webSearch: null,
    webFetch: null,
    fallbacks: false,
    maxOutput: 8192,
    baseURL: row.baseUrl,
    endpointId: row.id,
    group: row.name,
  }));
}

export async function listEndpoints(userId: string) {
  return db.query.userEndpoint.findMany({ where: eq(schema.userEndpoint.userId, userId), orderBy: asc(schema.userEndpoint.createdAt) });
}

/**
 * Los modelos de los endpoints propios del usuario, listos para el selector.
 */
export async function userModels(userId: string): Promise<ModelInfo[]> {
  return (await listEndpoints(userId)).flatMap(toModels);
}

/**
 * Como findModel, pero también reconoce los modelos de endpoints propios. Solo
 * devuelve un endpoint si es del usuario.
 */
export async function findModelForUser(userId: string, id: string): Promise<ModelInfo | undefined> {
  const match = /^ep:([^:]+):(.+)$/.exec(id);
  if (!match) return findModel(id);
  const row = await db.query.userEndpoint.findFirst({
    where: and(eq(schema.userEndpoint.id, match[1]), eq(schema.userEndpoint.userId, userId)),
  });
  return row ? toModels(row).find((m) => m.id === id) : undefined;
}

/**
 * La key para llamar al modelo: la del endpoint propio si es uno de esos, o la
 * del proveedor (propia o del servidor) si no.
 */
export async function resolveModelKey(userId: string, model: ModelInfo): Promise<ResolvedKey | null> {
  if (!model.endpointId) return resolveKey(userId, model.provider);
  const row = await db.query.userEndpoint.findFirst({
    where: and(eq(schema.userEndpoint.id, model.endpointId), eq(schema.userEndpoint.userId, userId)),
  });
  if (!row) return null;
  return { apiKey: row.apiKey ? decrypt(row.apiKey) : "", byok: true };
}
