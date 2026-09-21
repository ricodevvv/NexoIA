import { z } from "zod";
import { assertSafeUrl, safeFetch } from "@/lib/safe-url";

export const EndpointInput = z.object({
  name: z.string().trim().min(1).max(40),
  baseUrl: z.string().trim().url(),
  apiKey: z.string().trim().max(500).optional(),
  models: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
});

/**
 * Quita la barra final y un `/chat/completions` pegado por error, para quedarse
 * con la URL base que espera el SDK de OpenAI.
 */
export function normalizeBase(url: string) {
  return url.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
}

/**
 * Pide la lista de modelos a un endpoint compatible con OpenAI (`GET /models`).
 */
export async function detectModels(baseUrl: string, apiKey: string | null) {
  const base = normalizeBase(baseUrl);
  await assertSafeUrl(base);
  const res = await safeFetch(`${base}/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 || res.status === 403) throw new Error("El endpoint rechazó la API key");
  if (!res.ok) throw new Error(`El endpoint respondió ${res.status}`);
  const data = (await res.json()) as { data?: { id?: unknown }[] };
  return (data.data ?? [])
    .map((m) => m.id)
    .filter((id): id is string => typeof id === "string")
    .sort()
    .slice(0, 500);
}
