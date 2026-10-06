import { z } from "zod";
import type { AttachmentData, Effort, HistoryMessage, MessagePart, Usage } from "@/lib/ai/types";
import { HttpError } from "@/lib/http";

const TextPart = z.object({ type: z.literal("text"), text: z.string() });
const ImagePart = z.object({ type: z.literal("image_url"), image_url: z.object({ url: z.string(), detail: z.string().optional() }) });
const ContentPart = z.union([TextPart, ImagePart]);

const Content = z.union([z.string(), z.array(ContentPart), z.null()]);

const Message = z.object({
  role: z.enum(["system", "developer", "user", "assistant"]),
  content: Content.optional(),
  name: z.string().optional(),
});

export const ChatCompletionRequest = z.object({
  model: z.string().min(1),
  messages: z.array(Message).min(1).max(500),
  stream: z.boolean().optional().default(false),
  stream_options: z.object({ include_usage: z.boolean().optional() }).nullish(),
  max_tokens: z.number().int().positive().max(128_000).nullish(),
  max_completion_tokens: z.number().int().positive().max(128_000).nullish(),
  reasoning_effort: z.enum(["minimal", "low", "medium", "high", "xhigh", "max"]).nullish(),
  user: z.string().optional(),
});

export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequest>;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Convierte el esfuerzo de OpenAI al de Nexo. `minimal` cae en `low`.
 */
export function effortFrom(value: ChatCompletionRequest["reasoning_effort"]): Effort {
  if (!value) return "medium";
  return value === "minimal" ? "low" : value;
}

function decodeDataUrl(url: string) {
  const match = /^data:([\w/+.-]+);base64,([\s\S]+)$/.exec(url);
  if (!match) throw new HttpError(400, "Las imágenes deben ir como data URL en base64 (data:image/png;base64,…).");
  const [, mediaType, data] = match;
  if (!IMAGE_TYPES.includes(mediaType)) throw new HttpError(400, `Tipo de imagen no soportado: ${mediaType}`);
  const buffer = Buffer.from(data, "base64");
  if (buffer.length > MAX_IMAGE_BYTES) throw new HttpError(413, "Cada imagen puede pesar hasta 8 MB.");
  return { mediaType, buffer };
}

/**
 * Pasa los mensajes estilo Chat Completions al historial interno: junta los
 * `system`/`developer` en el system prompt y saca las imágenes como adjuntos.
 */
export function toHistory(messages: ChatCompletionRequest["messages"]) {
  const system: string[] = [];
  const history: HistoryMessage[] = [];
  const attachments = new Map<string, AttachmentData>();

  for (const message of messages) {
    const content = message.content ?? "";
    if (message.role === "system" || message.role === "developer") {
      system.push(typeof content === "string" ? content : content.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n"));
      continue;
    }
    const parts: MessagePart[] = [];
    if (typeof content === "string") {
      if (content) parts.push({ type: "text", text: content });
    } else {
      for (const part of content) {
        if (part.type === "text") {
          parts.push({ type: "text", text: part.text });
          continue;
        }
        if (message.role !== "user") continue;
        const { mediaType, buffer } = decodeDataUrl(part.image_url.url);
        const id = `img-${attachments.size + 1}`;
        attachments.set(id, { id, name: `${id}.${mediaType.split("/")[1]}`, mediaType, data: buffer });
        parts.push({ type: "attachment", attachmentId: id, name: `${id}.${mediaType.split("/")[1]}`, mediaType });
      }
    }
    if (!parts.length) continue;
    const last = history.at(-1);
    if (last && last.role === message.role) last.parts.push(...parts);
    else history.push({ role: message.role, parts });
  }

  if (!history.length || history[0].role !== "user") {
    throw new HttpError(400, "La conversación tiene que empezar con un mensaje de user.");
  }
  if (history.at(-1)?.role !== "user") throw new HttpError(400, "El último mensaje tiene que ser de user.");
  return { system: system.join("\n\n"), history, attachments };
}

export function completionId() {
  return `chatcmpl-${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

export function usageBody(usage: Usage) {
  return {
    prompt_tokens: usage.inputTokens,
    completion_tokens: usage.outputTokens,
    total_tokens: usage.inputTokens + usage.outputTokens,
  };
}

/**
 * Respuesta completa (sin streaming) con la forma de Chat Completions.
 */
export function completionBody(args: { id: string; model: string; text: string; reasoning: string; usage: Usage; truncated: boolean }) {
  return {
    id: args.id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: args.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: args.text, ...(args.reasoning ? { reasoning_content: args.reasoning } : {}) },
        finish_reason: args.truncated ? "length" : "stop",
      },
    ],
    usage: usageBody(args.usage),
  };
}

/**
 * Un pedazo del stream con la forma de `chat.completion.chunk`.
 */
export function chunkBody(args: { id: string; model: string; delta?: Record<string, string>; finish?: "stop" | "length" | null; usage?: Usage }) {
  return {
    id: args.id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: args.model,
    choices: args.usage ? [] : [{ index: 0, delta: args.delta ?? {}, finish_reason: args.finish ?? null }],
    ...(args.usage ? { usage: usageBody(args.usage) } : {}),
  };
}

const ERROR_TYPES: Record<number, string> = {
  400: "invalid_request_error",
  401: "authentication_error",
  402: "insufficient_quota",
  403: "permission_error",
  404: "not_found_error",
  413: "invalid_request_error",
  429: "rate_limit_error",
};

/**
 * Error con la forma que esperan los SDKs de OpenAI.
 */
export function errorBody(status: number, message: string) {
  return { error: { message, type: ERROR_TYPES[status] ?? "api_error", code: status === 402 ? "insufficient_quota" : null } };
}
