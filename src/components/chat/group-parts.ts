import type { MessagePart } from "@/lib/ai/types";

type ToolCallPart = Extract<MessagePart, { type: "tool_call" }>;

export type ActivityEntry =
  | { kind: "reasoning"; text: string; index: number }
  | { kind: "tool"; part: ToolCallPart; index: number }
  | { kind: "web"; calls: ToolCallPart[]; index: number };

export type RenderItem = { kind: "part"; part: MessagePart; index: number } | { kind: "activity"; entries: ActivityEntry[]; index: number };

const WEB_TOOLS = new Set(["web_search", "web_fetch"]);


const STANDALONE_TOOLS = new Set(["artifact", "show_widget"]);

function isStandalone(part: MessagePart) {
  if (part.type === "tool_call" && part.name === "question") return part.output !== undefined && !part.isError;
  return part.type === "text" || part.type === "notice" || (part.type === "tool_call" && STANDALONE_TOOLS.has(part.name) && !part.isError);
}

/**
 * Arma lo que se pinta de una respuesta: el texto, los avisos, los artifacts,
 * los widgets y las preguntas ya respondidas van sueltos; todo lo que hace el agente entre medio (razonar,
 * usar tools, buscar en la web) se junta en una caja de actividad. Las
 * búsquedas web seguidas se juntan en una sola fila.
 */
export function groupParts(parts: MessagePart[]): RenderItem[] {
  const items: RenderItem[] = [];
  let activity: { entries: ActivityEntry[]; index: number } | null = null;

  parts.forEach((part, index) => {
    if (isStandalone(part)) {
      if (part.type === "text" && !part.text.trim()) return;
      if (activity) items.push({ kind: "activity", ...activity });
      activity = null;
      items.push({ kind: "part", part, index });
      return;
    }
    activity ??= { entries: [], index };
    const last = activity.entries.at(-1);
    if (part.type === "reasoning") {
      if (part.text.trim() || !last) activity.entries.push({ kind: "reasoning", text: part.text, index });
    } else if (part.type === "tool_call" && WEB_TOOLS.has(part.name)) {
      if (last?.kind === "web") last.calls.push(part);
      else activity.entries.push({ kind: "web", calls: [part], index });
    } else if (part.type === "tool_call") {
      activity.entries.push({ kind: "tool", part, index });
    }
  });
  if (activity) items.push({ kind: "activity", ...(activity as { entries: ActivityEntry[]; index: number }) });
  return items;
}
