import type { Effort, ModelInfo } from "./types";

export const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

/**
 * Los niveles de esfuerzo que tiene sentido ofrecer según cómo razona el
 * modelo. Los de Anthropic aceptan los cinco; OpenAI y los endpoints
 * compatibles, hasta `high`, que es lo que todos entienden.
 */
export function effortsFor(reasoning: ModelInfo["reasoning"]): Effort[] {
  if (reasoning === "adaptive" || reasoning === "budget") return EFFORTS;
  if (reasoning === "openai" || reasoning === "compat") return EFFORTS.slice(0, 3);
  return [];
}

/**
 * Baja el esfuerzo pedido al más alto que acepta el modelo, para que un
 * "Máx" elegido con otro modelo no rompa la petición.
 */
export function clampEffort(effort: Effort, reasoning: ModelInfo["reasoning"]): Effort {
  const allowed = effortsFor(reasoning);
  return allowed.includes(effort) ? effort : (allowed.at(-1) ?? "medium");
}
