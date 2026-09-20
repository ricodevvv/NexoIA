import type { MessagePart, ProviderEvent } from "./types";

/**
 * Aplica un evento del stream sobre la lista de partes de un mensaje. Se usa
 * igual en el servidor (para guardar) y en el cliente (para pintar).
 */
export function applyEvent(parts: MessagePart[], event: ProviderEvent): MessagePart[] {
  const next = parts.slice();
  const last = next.at(-1);
  if (event.type === "text" || event.type === "reasoning") {
    if (last?.type === event.type) next[next.length - 1] = { ...last, text: last.text + event.delta };
    else next.push({ type: event.type, text: event.delta });
  } else if (event.type === "tool_call") {
    next.push({ type: "tool_call", id: event.call.id, name: event.call.name, input: event.call.input, server: event.server });
  } else if (event.type === "tool_result") {
    const index = next.findIndex((p) => p.type === "tool_call" && p.id === event.result.id);
    const part = next[index];
    if (part?.type === "tool_call") {
      next[index] = {
        ...part,
        output: event.result.output,
        isError: event.result.isError,
        ...(event.result.files?.length ? { files: event.result.files } : {}),
      };
    }
  } else if (event.type === "notice") {
    next.push({ type: "notice", level: event.level, text: event.text });
  }
  return next;
}
