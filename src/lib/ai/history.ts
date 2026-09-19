import type { AttachmentData, MessagePart } from "./types";

type ToolCallPart = Extract<MessagePart, { type: "tool_call" }>;

export type AssistantSegment = { text: string; calls: ToolCallPart[] };

/**
 * Parte un mensaje del asistente en tramos "texto + llamadas a tools", que es
 * como lo esperan las APIs cuando se reconstruye el historial desde cero.
 * Las tools de servidor y el razonamiento se descartan porque no se pueden
 * reenviar entre proveedores.
 */
export function splitAssistant(parts: MessagePart[]): AssistantSegment[] {
  const segments: AssistantSegment[] = [];
  let current: AssistantSegment = { text: "", calls: [] };
  for (const part of parts) {
    if (part.type === "text") {
      if (current.calls.length) {
        segments.push(current);
        current = { text: "", calls: [] };
      }
      current.text += part.text;
    } else if (part.type === "tool_call" && !part.server) {
      current.calls.push(part);
    }
  }
  if (current.text || current.calls.length) segments.push(current);
  return segments;
}

export function isTextLike(mediaType: string) {
  return mediaType.startsWith("text/") || /json|xml|javascript|typescript|csv|yaml/.test(mediaType);
}

export function fileAsText(file: AttachmentData) {
  return `<archivo nombre="${file.name}">\n${file.data.toString("utf8")}\n</archivo>`;
}

export function toolOutput(call: ToolCallPart) {
  return call.output ?? "La tool no devolvió resultado.";
}
