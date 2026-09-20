import { and, count, eq, gte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "@/lib/db";
import type { ModelInfo, Usage } from "@/lib/ai/types";
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
    .where(and(eq(schema.usage.userId, userId), eq(schema.usage.byok, false), gte(schema.usage.createdAt, startOfDay())));
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

export async function recordUsage(userId: string, model: string, usage: Usage, byok: boolean) {
  await db.insert(schema.usage).values({
    id: nanoid(),
    userId,
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    byok,
  });
}
