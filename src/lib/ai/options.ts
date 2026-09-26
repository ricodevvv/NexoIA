import type { ModelOption } from "@/components/chat/model-picker";
import { resolveKey } from "./keys";
import { listModels } from "./models";
import { userModels } from "./user-models";
import type { ProviderId } from "./types";

/**
 * Lista de modelos para la UI, marcando cuáles tienen key disponible para
 * este usuario y si la key es suya.
 */
export async function modelOptions(userId: string): Promise<ModelOption[]> {
  const models = listModels();
  const providers = [...new Set(models.map((m) => m.provider))];
  const keys = new Map<ProviderId, Awaited<ReturnType<typeof resolveKey>>>(
    await Promise.all(providers.map(async (p) => [p, await resolveKey(userId, p)] as const)),
  );
  const own = (await userModels(userId)).map((m) => ({
    id: m.id,
    group: m.group,
    provider: m.provider,
    label: m.label,
    description: m.description,
    tier: m.tier,
    available: true,
    byok: true,
    reasoning: m.reasoning !== "none",
    webSearch: false,
    vision: false,
    pdf: false,
  }));
  return [...own, ...models.map((m) => {
    const key = keys.get(m.provider);
    return {
      id: m.id,
      provider: m.provider,
      label: m.label,
      description: m.description,
      tier: m.tier,
      available: Boolean(key),
      byok: Boolean(key?.byok),
      reasoning: m.reasoning !== "none",
      webSearch: m.webSearch !== null,
      vision: m.vision,
      pdf: m.pdf,
    };
  })];
}
