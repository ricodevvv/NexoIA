import OpenAI from "openai";
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { safeFetch } from "@/lib/safe-url";
import { attachmentNote, fileAsText, isTextLike, splitAssistant, toolOutput } from "../history";
import { remoteModelId } from "../models";
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

function userContent(message: HistoryMessage, opts: SessionOptions): ChatCompletionContentPart[] {
  const content: ChatCompletionContentPart[] = [];
  for (const part of message.parts) {
    if (part.type === "text" && part.text) content.push({ type: "text", text: part.text });
    if (part.type !== "attachment") continue;
    const file = opts.attachments.get(part.attachmentId);
    if (!file) continue;
    if (["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.mediaType) && opts.model.vision) {
      content.push({ type: "image_url", image_url: { url: `data:${file.mediaType};base64,${file.data.toString("base64")}` } });
    } else if (isTextLike(file.mediaType)) {
      content.push({ type: "text", text: fileAsText(file) });
    } else {
      content.push({ type: "text", text: attachmentNote(file, opts.tools.some((t) => t.name === "run_python")) });
    }
  }
  return content.length ? content : [{ type: "text", text: "(mensaje vacío)" }];
}

const NO_EFFORT = new Set<string>();

/**
 * Dice si el endpoint rechazó la petición por el `reasoning_effort`: pasa con
 * modelos que no razonan o APIs compatibles que no conocen el parámetro.
 */
function rejectsEffort(err: unknown) {
  const status = (err as { status?: number }).status;
  return (status === 400 || status === 422) && /reasoning|effort|unrecognized|unknown|extra|not permitted|unsupported/i.test(String((err as Error).message));
}

/**
 * Algunos modelos abiertos (gpt-oss, por ejemplo) dejan colar tokens de su
 * formato interno en el nombre de la tool: `run_python<|channel|>commentary`.
 * Nos quedamos con el nombre real.
 */
export function cleanToolName(name: string) {
  return name.split("<|")[0].replace(/[^\w.-].*$/, "").trim() || name;
}

function assistantFromParts(message: HistoryMessage): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [];
  for (const segment of splitAssistant(message.parts)) {
    out.push({
      role: "assistant",
      content: segment.text || null,
      ...(segment.calls.length
        ? {
            tool_calls: segment.calls.map((c) => ({
              id: c.id,
              type: "function" as const,
              function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) },
            })),
          }
        : {}),
    });
    for (const call of segment.calls) out.push({ role: "tool", tool_call_id: call.id, content: toolOutput(call) });
  }
  return out;
}

function reasoningDelta(delta: object): string {
  const extra = delta as { reasoning_content?: unknown; reasoning?: unknown };
  const value = extra.reasoning_content ?? extra.reasoning;
  return typeof value === "string" ? value : "";
}

/**
 * Sesión para cualquier endpoint compatible con Chat Completions de OpenAI
 * (OpenRouter, Ollama, Groq, LM Studio, DeepSeek...).
 */
export function createCompatSession(opts: SessionOptions): ProviderSession {
  const client = new OpenAI({ apiKey: opts.apiKey || "sin-key", baseURL: opts.model.baseURL ?? process.env.COMPAT_BASE_URL,
    ...(opts.model.endpointId ? { fetch: safeFetch } : {}),
  });
  const modelId = remoteModelId(opts.model.id);
  const messages: ChatCompletionMessageParam[] = [{ role: "system", content: opts.system }];
  const turnItems: ChatCompletionMessageParam[] = [];

  for (const message of opts.history) {
    if (message.role === "user") messages.push({ role: "user", content: userContent(message, opts) });
    else if (message.native?.provider === "compat") messages.push(...(message.native.items as ChatCompletionMessageParam[]));
    else messages.push(...assistantFromParts(message));
  }

  const tools: ChatCompletionTool[] = opts.tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: { type: "object", ...t.inputSchema } },
  }));

  const effortKey = `${opts.model.baseURL ?? process.env.COMPAT_BASE_URL}|${modelId}`;

  function create(signal: AbortSignal, withEffort: boolean) {
    return client.chat.completions.create(
      {
        model: modelId,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: opts.model.maxOutput,
        ...(tools.length ? { tools } : {}),
        ...(withEffort ? { reasoning_effort: opts.effort } : {}),
      },
      { signal },
    );
  }

  async function* step(signal: AbortSignal): AsyncGenerator<ProviderEvent, StepResult> {
    const withEffort = opts.model.reasoning === "compat" && !NO_EFFORT.has(effortKey);
    const stream = await create(signal, withEffort).catch((err) => {
      if (!withEffort || !rejectsEffort(err)) throw err;
      NO_EFFORT.add(effortKey);
      return create(signal, false);
    });

    let text = "";
    let finish: string | null = null;
    const usage = { inputTokens: 0, outputTokens: 0 };
    const pending = new Map<number, { id: string; name: string; args: string }>();

    for await (const chunk of stream) {
      if (chunk.usage) {
        usage.inputTokens = chunk.usage.prompt_tokens;
        usage.outputTokens = chunk.usage.completion_tokens;
      }
      const choice = chunk.choices[0];
      if (!choice) continue;
      const reasoning = reasoningDelta(choice.delta);
      if (reasoning) yield { type: "reasoning", delta: reasoning };
      if (choice.delta.content) {
        text += choice.delta.content;
        yield { type: "text", delta: choice.delta.content };
      }
      for (const tc of choice.delta.tool_calls ?? []) {
        const entry = pending.get(tc.index) ?? { id: "", name: "", args: "" };
        if (tc.id) entry.id = tc.id;
        if (tc.function?.name) entry.name += tc.function.name;
        if (tc.function?.arguments) entry.args += tc.function.arguments;
        pending.set(tc.index, entry);
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    }

    const toolCalls: ToolCall[] = [...pending.values()].map((p, i) => {
      let input: unknown = {};
      try {
        input = JSON.parse(p.args || "{}");
      } catch {
        input = { _raw: p.args };
      }
      return { id: p.id || `call_${i}`, name: cleanToolName(p.name), input };
    });

    const assistant: ChatCompletionMessageParam = {
      role: "assistant",
      content: text || null,
      ...(toolCalls.length
        ? {
            tool_calls: toolCalls.map((c) => ({
              id: c.id,
              type: "function" as const,
              function: { name: c.name, arguments: JSON.stringify(c.input) },
            })),
          }
        : {}),
    };
    messages.push(assistant);
    turnItems.push(assistant);

    if (finish === "length") {
      yield { type: "notice", level: "warning", text: "La respuesta llegó al límite de tokens." };
      if (toolCalls.length) return { toolCalls: [], paused: false, usage };
    }
    for (const call of toolCalls) yield { type: "tool_call", call };
    return { toolCalls, paused: false, usage };
  }

  function addToolResults(results: ToolResult[]) {
    for (const r of results) {
      const item: ChatCompletionMessageParam = { role: "tool", tool_call_id: r.id, content: r.output };
      messages.push(item);
      turnItems.push(item);
    }
  }

  function nativeTurn(): NativeTurn {
    return { provider: "compat", model: opts.model.id, items: turnItems };
  }

  return { step, addToolResults, nativeTurn };
}
