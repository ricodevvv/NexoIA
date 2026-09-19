import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessageStreamParams,
  BetaMessageParam,
  BetaToolUnion,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { fileAsText, isTextLike, splitAssistant, toolOutput } from "../history";
import type {
  HistoryMessage,
  NativeTurn,
  ProviderEvent,
  ProviderSession,
  SessionOptions,
  StepResult,
  ToolCall,
  ToolResult,
} from "../types";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const BUDGETS = { low: 0, medium: 4000, high: 12000 };

function userContent(message: HistoryMessage, opts: SessionOptions): BetaContentBlockParam[] {
  const blocks: BetaContentBlockParam[] = [];
  for (const part of message.parts) {
    if (part.type === "text" && part.text) blocks.push({ type: "text", text: part.text });
    if (part.type !== "attachment") continue;
    const file = opts.attachments.get(part.attachmentId);
    if (!file) continue;
    if (IMAGE_TYPES.includes(file.mediaType as ImageType)) {
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: file.mediaType as ImageType, data: file.data.toString("base64") },
      });
    } else if (file.mediaType === "application/pdf") {
      blocks.push({
        type: "document",
        title: file.name,
        source: { type: "base64", media_type: "application/pdf", data: file.data.toString("base64") },
      });
    } else if (isTextLike(file.mediaType)) {
      blocks.push({ type: "text", text: fileAsText(file) });
    }
  }
  return blocks.length ? blocks : [{ type: "text", text: "(mensaje vacío)" }];
}

function assistantFromParts(message: HistoryMessage): BetaMessageParam[] {
  const out: BetaMessageParam[] = [];
  for (const segment of splitAssistant(message.parts)) {
    const content: BetaContentBlockParam[] = [];
    if (segment.text) content.push({ type: "text", text: segment.text });
    for (const call of segment.calls) {
      content.push({ type: "tool_use", id: call.id, name: call.name, input: call.input ?? {} });
    }
    if (!content.length) continue;
    out.push({ role: "assistant", content });
    if (segment.calls.length) {
      out.push({
        role: "user",
        content: segment.calls.map((call) => ({
          type: "tool_result" as const,
          tool_use_id: call.id,
          content: toolOutput(call),
          is_error: call.isError ?? false,
        })),
      });
    }
  }
  return out;
}

function buildMessages(opts: SessionOptions): BetaMessageParam[] {
  const messages: BetaMessageParam[] = [];
  for (const message of opts.history) {
    if (message.role === "user") {
      messages.push({ role: "user", content: userContent(message, opts) });
    } else if (message.native?.provider === "anthropic") {
      messages.push(...(message.native.items as BetaMessageParam[]));
    } else {
      messages.push(...assistantFromParts(message));
    }
  }
  return messages;
}

function searchSummary(block: Extract<BetaContentBlock, { type: "web_search_tool_result" }>) {
  if (!Array.isArray(block.content)) {
    return { output: `Error de búsqueda: ${block.content.error_code}`, isError: true };
  }
  const lines = block.content.map((r) => `${r.title}\n${r.url}`);
  return { output: lines.join("\n\n") || "Sin resultados", isError: false };
}

/**
 * Sesión de chat contra la API de Anthropic. Mantiene los mensajes nativos
 * del turno para poder reenviarlos tal cual (con sus bloques de thinking)
 * en los siguientes turnos.
 */
export function createAnthropicSession(opts: SessionOptions): ProviderSession {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const messages = buildMessages(opts);
  const turnItems: BetaMessageParam[] = [];
  const { model } = opts;

  const tools: BetaToolUnion[] = opts.tools.map((t) => ({
    name: t.name,
    description: t.description.slice(0, 1024),
    input_schema: { type: "object", ...t.inputSchema },
  }));
  if (opts.webSearch && model.webSearch && model.webSearch !== "openai") {
    tools.push({ type: model.webSearch, name: "web_search", max_uses: 5 });
  }

  function params(): BetaMessageStreamParams {
    const base: BetaMessageStreamParams = {
      model: model.id,
      max_tokens: model.maxOutput,
      system: opts.system,
      messages,
      cache_control: { type: "ephemeral" },
      ...(tools.length ? { tools } : {}),
    };
    if (model.reasoning === "adaptive") {
      base.thinking = { type: "adaptive", display: "summarized" };
      base.output_config = { effort: opts.effort };
    } else if (model.reasoning === "budget" && BUDGETS[opts.effort] > 0) {
      base.thinking = { type: "enabled", budget_tokens: BUDGETS[opts.effort] };
    }
    if (model.fallbacks) {
      base.betas = ["server-side-fallback-2026-07-01"];
      base.fallbacks = "default";
    }
    return base;
  }

  async function* step(signal: AbortSignal): AsyncGenerator<ProviderEvent, StepResult> {
    const stream = client.beta.messages.stream(params(), { signal });
    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") yield { type: "text", delta: event.delta.text };
        if (event.delta.type === "thinking_delta") yield { type: "reasoning", delta: event.delta.thinking };
      }
      if (event.type === "content_block_stop") {
        const block = stream.currentMessage?.content[event.index];
        if (block?.type === "server_tool_use") {
          yield { type: "tool_call", server: true, call: { id: block.id, name: block.name, input: block.input } };
        }
        if (block?.type === "web_search_tool_result") {
          const { output, isError } = searchSummary(block);
          yield { type: "tool_result", server: true, result: { id: block.tool_use_id, name: "web_search", output, isError } };
        }
      }
    }

    const final = await stream.finalMessage();
    const assistant: BetaMessageParam = { role: "assistant", content: final.content as BetaContentBlockParam[] };
    messages.push(assistant);
    turnItems.push(assistant);

    const usage = {
      inputTokens:
        final.usage.input_tokens + (final.usage.cache_read_input_tokens ?? 0) + (final.usage.cache_creation_input_tokens ?? 0),
      outputTokens: final.usage.output_tokens,
    };

    if (final.stop_reason === "refusal") {
      yield { type: "notice", level: "warning", text: "El modelo decidió no continuar con esta respuesta." };
      return { toolCalls: [], paused: false, usage };
    }
    if (final.stop_reason === "pause_turn") return { toolCalls: [], paused: true, usage };

    const toolCalls: ToolCall[] = [];
    for (const block of final.content) {
      if (block.type === "tool_use") toolCalls.push({ id: block.id, name: block.name, input: block.input });
    }
    if (toolCalls.length && final.stop_reason === "max_tokens") {
      yield { type: "notice", level: "error", text: "La respuesta se cortó antes de terminar la llamada a la tool." };
      return { toolCalls: [], paused: false, usage };
    }
    if (final.stop_reason === "max_tokens") {
      yield { type: "notice", level: "warning", text: "La respuesta llegó al límite de tokens." };
    }
    for (const call of toolCalls) yield { type: "tool_call", call };
    return { toolCalls, paused: false, usage };
  }

  function addToolResults(results: ToolResult[]) {
    const message: BetaMessageParam = {
      role: "user",
      content: results.map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.id,
        content: r.output,
        is_error: r.isError,
      })),
    };
    messages.push(message);
    turnItems.push(message);
  }

  function nativeTurn(): NativeTurn {
    return { provider: "anthropic", model: model.id, items: turnItems };
  }

  return { step, addToolResults, nativeTurn };
}
