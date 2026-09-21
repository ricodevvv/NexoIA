import type { ModelInfo } from "./types";

const anthropicModels: ModelInfo[] = [
  {
    id: "claude-opus-5",
    provider: "anthropic",
    label: "Claude Opus 5",
    description: "El más completo para trabajo serio",
    tier: "pro",
    vision: true,
    pdf: true,
    reasoning: "adaptive",
    webSearch: "web_search_20260209",
    webFetch: "web_fetch_20260209",
    fallbacks: true,
    maxOutput: 64000,
  },
  {
    id: "claude-fable-5-1",
    provider: "anthropic",
    label: "Claude Fable 5.1",
    description: "Máxima capacidad, más lento y caro",
    tier: "pro",
    vision: true,
    pdf: true,
    reasoning: "adaptive",
    webSearch: "web_search_20260209",
    webFetch: "web_fetch_20260209",
    fallbacks: true,
    maxOutput: 64000,
  },
  {
    id: "claude-sonnet-5",
    provider: "anthropic",
    label: "Claude Sonnet 5",
    description: "Rápido y listo para el día a día",
    tier: "free",
    vision: true,
    pdf: true,
    reasoning: "adaptive",
    webSearch: "web_search_20260209",
    webFetch: "web_fetch_20260209",
    fallbacks: false,
    maxOutput: 64000,
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    description: "El más veloz y barato",
    tier: "free",
    vision: true,
    pdf: true,
    reasoning: "budget",
    webSearch: "web_search_20250305",
    webFetch: "web_fetch_20250910",
    fallbacks: false,
    maxOutput: 32000,
  },
];

function listFromEnv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function openaiModels(): ModelInfo[] {
  if (!process.env.OPENAI_API_KEY && !process.env.OPENAI_MODELS) return [];
  return listFromEnv(process.env.OPENAI_MODELS || "gpt-5,gpt-5-mini").map((id) => ({
    id,
    provider: "openai",
    label: id.replace(/^gpt/i, "GPT"),
    description: "OpenAI · Responses API",
    tier: /mini|nano/.test(id) ? "free" : "pro",
    vision: true,
    pdf: true,
    reasoning: /^(gpt-5|o\d)/.test(id) ? "openai" : "none",
    webSearch: "openai",
    webFetch: null,
    fallbacks: false,
    maxOutput: 32000,
  }));
}

function compatModels(): ModelInfo[] {
  if (!process.env.COMPAT_BASE_URL) return [];
  const name = process.env.COMPAT_NAME || "Compatible";
  return listFromEnv(process.env.COMPAT_MODELS).map((id) => ({
    id: `compat:${id}`,
    provider: "compat",
    label: id,
    description: `${name} · endpoint compatible con OpenAI`,
    tier: "free",
    vision: false,
    pdf: false,
    reasoning: "none",
    webSearch: null,
    webFetch: null,
    fallbacks: false,
    maxOutput: 8192,
  }));
}

/**
 * Lista de modelos disponibles. Anthropic siempre aparece; OpenAI y el endpoint
 * compatible solo si están configurados en el entorno.
 */
export function listModels(): ModelInfo[] {
  return [...anthropicModels, ...openaiModels(), ...compatModels()];
}

/**
 * El id que espera el proveedor: sin el prefijo `compat:` ni `ep:<endpoint>:`.
 */
export function remoteModelId(id: string) {
  if (id.startsWith("compat:")) return id.slice("compat:".length);
  const match = /^ep:[^:]+:(.+)$/.exec(id);
  return match ? match[1] : id;
}

export function findModel(id: string): ModelInfo | undefined {
  return listModels().find((m) => m.id === id);
}

export const DEFAULT_MODEL = "claude-opus-5";
