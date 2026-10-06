import { runTurn } from "@/lib/ai/engine";
import { estimateCost } from "@/lib/ai/models";
import { findModelForUser, resolveModelKey } from "@/lib/ai/user-models";
import type { AttachmentData, Effort, HistoryMessage, ModelInfo, ProviderEvent, Usage } from "@/lib/ai/types";
import { checkQuota, recordUsage } from "@/lib/billing/usage";
import { HttpError } from "@/lib/http";

export type PreparedModel = Awaited<ReturnType<typeof prepareModel>>;

/**
 * Busca el modelo, su key y revisa el plan antes de gastar nada. Lanza un
 * HttpError con el motivo si no se puede usar.
 */
export async function prepareModel(userId: string, modelId: string) {
  const model = await findModelForUser(userId, modelId);
  if (!model) throw new HttpError(404, `El modelo ${modelId} no existe o no está disponible para tu cuenta.`);
  const key = await resolveModelKey(userId, model);
  if (!key) throw new HttpError(400, `No hay API key configurada para ${model.label}.`);
  const blocked = await checkQuota(userId, model, key.byok);
  if (blocked) throw new HttpError(402, blocked);
  return { model, key };
}

export type CompletionInput = {
  userId: string;
  prepared: PreparedModel;
  system: string;
  history: HistoryMessage[];
  attachments?: Map<string, AttachmentData>;
  effort: Effort;
  maxTokens?: number;
  source: "api" | "playground";
  apiKeyId?: string | null;
  signal: AbortSignal;
  onEvent?: (event: ProviderEvent) => void;
};

export type CompletionResult = {
  text: string;
  reasoning: string;
  usage: Usage;
  error: string | null;
  latencyMs: number;
  cost: number | null;
  model: ModelInfo;
  truncated: boolean;
};

/**
 * Corre una respuesta sin tools (para la API y el playground), la registra en
 * el uso y devuelve el texto completo con tokens, latencia y costo estimado.
 */
export async function runCompletion(input: CompletionInput): Promise<CompletionResult> {
  const { model, key } = input.prepared;
  const startedAt = Date.now();
  let truncated = false;
  const outcome = await runTurn(
    {
      model,
      apiKey: key.apiKey,
      system: input.system,
      history: input.history,
      attachments: input.attachments ?? new Map(),
      tools: [],
      effort: input.effort,
      webSearch: false,
      research: false,
      maxTokens: input.maxTokens,
    },
    async (call) => ({ id: call.id, name: call.name, output: "No hay tools en esta petición.", isError: true }),
    (event) => {
      if (event.type === "notice" && /límite de tokens/.test(event.text)) truncated = true;
      input.onEvent?.(event);
    },
    input.signal,
  );
  const latencyMs = Date.now() - startedAt;
  const text = outcome.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("");
  const reasoning = outcome.parts.flatMap((p) => (p.type === "reasoning" ? [p.text] : [])).join("");
  if (outcome.usage.inputTokens || outcome.usage.outputTokens || outcome.error) {
    await recordUsage({
      userId: input.userId,
      model: model.id,
      usage: outcome.usage,
      byok: key.byok,
      source: input.source,
      apiKeyId: input.apiKeyId ?? null,
      latencyMs,
      error: outcome.error,
    });
  }
  return {
    text,
    reasoning,
    usage: outcome.usage,
    error: outcome.error,
    latencyMs,
    cost: estimateCost(model.pricing, outcome.usage),
    model,
    truncated,
  };
}
