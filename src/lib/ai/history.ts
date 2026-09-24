import type { AttachmentData, MessagePart } from "./types";
import { isZip, listZip } from "@/lib/zip";

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

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Aviso para el modelo sobre un adjunto que no puede leer directo (zip, Office,
 * binarios): dónde está para usarlo con `run_python` y, si es un zip, qué trae.
 */
export function attachmentNote(file: AttachmentData, hasCode: boolean) {
  const lines = [`<adjunto nombre="${file.name}" tipo="${file.mediaType}" tamaño="${humanSize(file.data.length)}">`];
  lines.push(
    hasCode
      ? `No lo puedes leer directo, pero está en /mnt/data/${file.name} dentro de run_python (usa zipfile, tarfile, openpyxl, etc.).`
      : "No lo puedes abrir en esta conversación: la ejecución de código no está disponible. Díselo al usuario si lo necesitas.",
  );
  if (isZip(file.mediaType, file.name)) {
    const listing = listZip(file.data);
    if (listing) {
      lines.push(`Contenido (${listing.total} entradas):`);
      for (const e of listing.entries) lines.push(e.dir ? `  ${e.name}` : `  ${e.name} (${humanSize(e.size)})`);
      if (listing.total > listing.entries.length) lines.push(`  … y ${listing.total - listing.entries.length} más`);
    } else {
      lines.push("No pude leer el índice del zip; puede estar dañado.");
    }
  }
  lines.push("</adjunto>");
  return lines.join("\n");
}

export function toolOutput(call: ToolCallPart) {
  return call.output ?? "La tool no devolvió resultado.";
}
