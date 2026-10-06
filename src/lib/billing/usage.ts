import { and, count, eq, gte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/lib/db";
import type { ModelInfo, Quota, Usage } from "@/lib/ai/types";
import { PLANS, type PlanId } from "./plans";
import { hasActiveTeam } from "./team";

export async function getPlan(userId: string): Promise<PlanId> {
  const sub = await db.query.subscription.findFirst({ where: eq(schema.subscription.userId, userId) });
  if (sub?.plan === "pro" && ["active", "trialing", "past_due"].includes(sub.status)) return "pro";
  if (await hasActiveTeam(userId)) return "pro";
  return "free";
}

function startOfDay() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function usedToday(userId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(schema.usage)
    .where(
      and(
        eq(schema.usage.userId, userId),
        eq(schema.usage.byok, false),
        eq(schema.usage.status, "ok"),
        gte(schema.usage.createdAt, startOfDay()),
      ),
    );
  return row?.n ?? 0;
}

/**
 * Revisa si el usuario puede mandar un mensaje con ese modelo según su plan.
 * Con key propia no hay límites. Devuelve el motivo si no puede.
 */
export async function checkQuota(userId: string, model: ModelInfo, byok: boolean): Promise<string | null> {
  if (byok) return null;
  const plan = await getPlan(userId);
  if (model.tier === "pro" && plan !== "pro") {
    return `${model.label} es parte del plan Pro. Mejora tu plan o agrega tu propia API key en Ajustes.`;
  }
  const used = await usedToday(userId);
  if (used >= PLANS[plan].dailyMessages) {
    return `Llegaste al límite de ${PLANS[plan].dailyMessages} mensajes de hoy. Se reinicia a las 00:00 UTC.`;
  }
  return null;
}

function nextReset() {
  const d = startOfDay();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

/**
 * Cuántos mensajes lleva hoy el usuario contra el límite de su plan, y cuándo
 * se reinicia la cuenta.
 */
export async function quotaStatus(userId: string): Promise<Quota> {
  const [plan, used] = await Promise.all([getPlan(userId), usedToday(userId)]);
  return { used, limit: PLANS[plan].dailyMessages, plan, resetsAt: nextReset() };
}

export type UsageRecord = {
  userId: string;
  model: string;
  usage: Usage;
  byok: boolean;
  source?: "chat" | "api" | "playground" | "code";
  apiKeyId?: string | null;
  conversationId?: string | null;
  latencyMs?: number | null;
  error?: string | null;
};

/**
 * Guarda una petición al modelo con sus tokens, de dónde vino y cuánto tardó.
 * Si trae `error` queda como fallida y no cuenta para el límite del plan.
 */
export async function recordUsage(record: UsageRecord) {
  await db.insert(schema.usage).values({
    id: nanoid(),
    userId: record.userId,
    model: record.model,
    inputTokens: record.usage.inputTokens,
    outputTokens: record.usage.outputTokens,
    byok: record.byok,
    source: record.source ?? "chat",
    apiKeyId: record.apiKeyId ?? null,
    conversationId: record.conversationId ?? null,
    latencyMs: record.latencyMs ?? null,
    status: record.error ? "error" : "ok",
    error: record.error?.slice(0, 500) ?? null,
  });
}
