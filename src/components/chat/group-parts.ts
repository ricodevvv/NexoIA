import type { MessagePart } from "@/lib/ai/types";

type ToolCallPart = Extract<MessagePart, { type: "tool_call" }>;

export type RenderItem = { kind: "part"; part: MessagePart; index: number } | { kind: "web"; calls: ToolCallPart[]; index: number };

const WEB_TOOLS = new Set(["web_search", "web_fetch"]);

function isWeb(part: MessagePart): part is ToolCallPart {
  return part.type === "tool_call" && WEB_TOOLS.has(part.name);
}

/**
 * Junta en un solo bloque las búsquedas y lecturas web seguidas (el razonamiento
 * entre ellas no corta el grupo). Así una investigación con veinte búsquedas no
 * llena el chat de filas.
 */
export function groupParts(parts: MessagePart[]): RenderItem[] {
  const items: RenderItem[] = [];
  let group: { calls: ToolCallPart[]; index: number } | null = null;
  parts.forEach((part, index) => {
    if (isWeb(part)) {
      group ??= { calls: [], index };
      group.calls.push(part);
      return;
    }
    if (group && part.type === "reasoning") return;
    if (group) {
      items.push(group.calls.length > 1 ? { kind: "web", ...group } : { kind: "part", part: group.calls[0], index: group.index });
      group = null;
    }
    items.push({ kind: "part", part, index });
  });
  if (group) {
    const g = group as { calls: ToolCallPart[]; index: number };
    items.push(g.calls.length > 1 ? { kind: "web", ...g } : { kind: "part", part: g.calls[0], index: g.index });
  }
  return items;
}
