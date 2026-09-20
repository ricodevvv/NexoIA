import { logError } from "@/lib/log";
import { applyEvent } from "./parts";
import { createAnthropicSession } from "./providers/anthropic";
import { createCompatSession } from "./providers/compat";
import { createOpenAISession } from "./providers/openai";
import type {
  MessagePart,
  NativeTurn,
  ProviderEvent,
  ProviderSession,
  SessionOptions,
  StepResult,
  ToolCall,
  ToolResult,
  Usage,
} from "./types";

const MAX_STEPS = 25;

export type ToolExecutor = (call: ToolCall, signal: AbortSignal) => Promise<ToolResult>;

export type TurnOutcome = {
  parts: MessagePart[];
  native: NativeTurn | null;
  usage: Usage;
};

function createSession(opts: SessionOptions): ProviderSession {
  if (opts.model.provider === "anthropic") return createAnthropicSession(opts);
  if (opts.model.provider === "openai") return createOpenAISession(opts);
  return createCompatSession(opts);
}

/**
 * Corre un turno completo del asistente: llama al modelo, ejecuta las tools
 * que pida y repite hasta que termine. Cada evento se reenvía por `emit` para
 * el streaming y a la vez se acumula en `parts` para guardarlo.
 */
export async function runTurn(
  opts: SessionOptions,
  execute: ToolExecutor,
  emit: (event: ProviderEvent) => void,
  signal: AbortSignal,
): Promise<TurnOutcome> {
  const session = createSession(opts);
  let parts: MessagePart[] = [];
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  let clean = true;

  const push = (event: ProviderEvent) => {
    parts = applyEvent(parts, event);
    emit(event);
  };

  try {
    for (let i = 0; i < MAX_STEPS; i++) {
      const it = session.step(signal);
      let result: StepResult;
      while (true) {
        const next = await it.next();
        if (next.done) {
          result = next.value;
          break;
        }
        push(next.value);
      }
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;

      if (result.paused) continue;
      if (!result.toolCalls.length) break;

      const results = await Promise.all(
        result.toolCalls.map(async (call) => {
          if (signal.aborted) return { id: call.id, name: call.name, output: "Cancelado por el usuario", isError: true };
          return execute(call, signal);
        }),
      );
      for (const r of results) push({ type: "tool_result", result: r });
      session.addToolResults(results);
      if (signal.aborted) break;
      if (i === MAX_STEPS - 1) {
        push({ type: "notice", level: "warning", text: "Se alcanzó el máximo de pasos con tools en este turno." });
      }
    }
  } catch (err) {
    clean = false;
    if (!signal.aborted) {
      logError("provider", err, { provider: opts.model.provider, model: opts.model.id, status: (err as { status?: number }).status });
      const text = describeError(err);
      push({ type: "notice", level: "error", text });
    }
  }

  const native = session.nativeTurn();
  return { parts, native: clean && native.items.length ? native : null, usage };
}

function describeError(err: unknown) {
  const e = err as { status?: number; message?: string };
  if (e.status === 401) return "La API key no es válida o expiró.";
  if (e.status === 429) return "El proveedor está limitando las peticiones. Intenta de nuevo en un momento.";
  if (e.status === 529 || e.status === 503) return "El proveedor está saturado. Intenta de nuevo en un momento.";
  if (e.status && e.status >= 400 && e.status < 500) return `El proveedor rechazó la petición: ${e.message}`;
  return `Algo falló al generar la respuesta: ${e.message ?? "error desconocido"}`;
}
