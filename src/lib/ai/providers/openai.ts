import OpenAI from "openai";
import type {
  ResponseCreateParamsStreaming,
  ResponseInputContent,
  ResponseInputItem,
  ResponseOutputItem,
  Tool,
} from "openai/resources/responses/responses";
import { clampEffort } from "../effort";
import { attachmentNote, fileAsText, isTextLike, splitAssistant, toolOutput } from "../history";
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

function dataUrl(mediaType: string, data: Buffer) {
  return `data:${mediaType};base64,${data.toString("base64")}`;
}

const RASTER = ["image/png", "image/jpeg", "image/gif", "image/webp"];

function userContent(message: HistoryMessage, opts: SessionOptions): ResponseInputContent[] {
  const content: ResponseInputContent[] = [];
  for (const part of message.parts) {
    if (part.type === "text" && part.text) content.push({ type: "input_text", text: part.text });
    if (part.type !== "attachment") continue;
    const file = opts.attachments.get(part.attachmentId);
    if (!file) continue;
    if (RASTER.includes(file.mediaType)) {
      content.push({ type: "input_image", detail: "auto", image_url: dataUrl(file.mediaType, file.data) });
    } else if (file.mediaType === "application/pdf") {
      content.push({ type: "input_file", filename: file.name, file_data: dataUrl(file.mediaType, file.data) });
    } else if (isTextLike(file.mediaType)) {
      content.push({ type: "input_text", text: fileAsText(file) });
    } else {
      content.push({ type: "input_text", text: attachmentNote(file, opts.tools.some((t) => t.name === "run_python")) });
    }
  }
  return content.length ? content : [{ type: "input_text", text: "(mensaje vacío)" }];
}

function assistantFromParts(message: HistoryMessage): ResponseInputItem[] {
  const items: ResponseInputItem[] = [];
  for (const segment of splitAssistant(message.parts)) {
    if (segment.text) items.push({ role: "assistant", content: segment.text });
    for (const call of segment.calls) {
      items.push({ type: "function_call", call_id: call.id, name: call.name, arguments: JSON.stringify(call.input ?? {}) });
      items.push({ type: "function_call_output", call_id: call.id, output: toolOutput(call) });
    }
  }
  return items;
}

function buildInput(opts: SessionOptions): ResponseInputItem[] {
  const input: ResponseInputItem[] = [];
  for (const message of opts.history) {
    if (message.role === "user") {
      input.push({ role: "user", content: userContent(message, opts) });
    } else if (message.native?.provider === "openai") {
      input.push(...(message.native.items as ResponseInputItem[]));
    } else {
      input.push(...assistantFromParts(message));
    }
  }
  return input;
}

function parseArgs(raw: string) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return { _raw: raw };
  }
}

/**
 * Sesión contra la Responses API de OpenAI en modo sin estado (`store: false`).
 * Los items de salida, incluido el razonamiento cifrado, se guardan para
 * reenviarlos en el siguiente turno.
 */
export function createOpenAISession(opts: SessionOptions): ProviderSession {
  const client = new OpenAI({ apiKey: opts.apiKey });
  const input = buildInput(opts);
  const turnItems: ResponseInputItem[] = [];
  const { model } = opts;

  const tools: Tool[] = opts.tools.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description,
    parameters: { type: "object", ...t.inputSchema },
    strict: false,
  }));
  if (opts.webSearch && model.webSearch === "openai") tools.push({ type: "web_search" });

  function params(): ResponseCreateParamsStreaming {
    return {
      model: model.id,
      instructions: opts.system,
      input,
      stream: true,
      store: false,
      max_output_tokens: model.maxOutput,
      ...(tools.length ? { tools } : {}),
      ...(model.reasoning === "openai"
        ? { reasoning: { effort: clampEffort(opts.effort, model.reasoning), summary: "auto" as const }, include: ["reasoning.encrypted_content" as const] }
        : {}),
    };
  }

  async function* step(signal: AbortSignal): AsyncGenerator<ProviderEvent, StepResult> {
    const stream = await client.responses.create(params(), { signal });
    let output: ResponseOutputItem[] = [];
    let usage = { inputTokens: 0, outputTokens: 0 };
    let incomplete: string | null = null;

    for await (const event of stream) {
      if (event.type === "response.output_text.delta") yield { type: "text", delta: event.delta };
      if (event.type === "response.reasoning_summary_text.delta") yield { type: "reasoning", delta: event.delta };
      if (event.type === "response.reasoning_summary_part.done") yield { type: "reasoning", delta: "\n\n" };
      if (event.type === "response.output_item.done" && event.item.type === "web_search_call") {
        const item = event.item;
        const query = item.action.type === "search" ? item.action.query : item.action.type;
        yield { type: "tool_call", server: true, call: { id: item.id, name: "web_search", input: { query } } };
        yield {
          type: "tool_result",
          server: true,
          result: { id: item.id, name: "web_search", output: `Estado: ${item.status}`, isError: item.status === "failed" },
        };
      }
      if (event.type === "response.completed" || event.type === "response.incomplete") {
        output = event.response.output;
        usage = {
          inputTokens: event.response.usage?.input_tokens ?? 0,
          outputTokens: event.response.usage?.output_tokens ?? 0,
        };
        if (event.type === "response.incomplete") incomplete = event.response.incomplete_details?.reason ?? "desconocido";
      }
      if (event.type === "response.failed") {
        throw new Error(event.response.error?.message ?? "OpenAI no pudo completar la respuesta");
      }
      if (event.type === "error") throw new Error(event.message);
    }

    const items = output as ResponseInputItem[];
    input.push(...items);
    turnItems.push(...items);

    const toolCalls: ToolCall[] = [];
    for (const item of output) {
      if (item.type === "function_call") {
        toolCalls.push({ id: item.call_id, name: item.name, input: parseArgs(item.arguments) });
      }
    }
    if (incomplete) {
      yield { type: "notice", level: "warning", text: `Respuesta incompleta (${incomplete}).` };
      if (toolCalls.length) return { toolCalls: [], paused: false, usage };
    }
    for (const call of toolCalls) yield { type: "tool_call", call };
    return { toolCalls, paused: false, usage };
  }

  function addToolResults(results: ToolResult[]) {
    for (const r of results) {
      const item: ResponseInputItem = { type: "function_call_output", call_id: r.id, output: r.output };
      input.push(item);
      turnItems.push(item);
    }
  }

  function nativeTurn(): NativeTurn {
    return { provider: "openai", model: model.id, items: turnItems };
  }

  return { step, addToolResults, nativeTurn };
}
