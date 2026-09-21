import { describe, expect, it } from "vitest";
import { groupParts } from "@/components/chat/group-parts";
import type { MessagePart } from "@/lib/ai/types";

const search = (id: string): MessagePart => ({ type: "tool_call", id, name: "web_search", input: { query: id }, server: true, output: "ok" });
const tool = (id: string, name = "reloj__get_time"): MessagePart => ({ type: "tool_call", id, name, input: {}, output: "ok" });

describe("groupParts", () => {
  it("junta razonamiento y tools en una caja entre textos", () => {
    const items = groupParts([
      { type: "reasoning", text: "Pienso" },
      tool("t1"),
      { type: "text", text: "Listo." },
      tool("t2"),
      { type: "text", text: "Fin." },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["activity", "part", "activity", "part"]);
    const first = items[0];
    expect(first.kind === "activity" && first.entries.map((e) => e.kind)).toEqual(["reasoning", "tool"]);
  });

  it("junta búsquedas web seguidas en una sola fila", () => {
    const items = groupParts([search("a"), search("b"), tool("x"), search("c")]);
    const box = items[0];
    expect(box.kind === "activity" && box.entries.map((e) => (e.kind === "web" ? `web:${e.calls.length}` : e.kind))).toEqual(["web:2", "tool", "web:1"]);
  });

  it("deja los artifacts y los avisos fuera de la caja", () => {
    const artifact: MessagePart = { type: "tool_call", id: "a", name: "artifact", input: {}, output: "ok" };
    const items = groupParts([tool("t"), artifact, { type: "notice", level: "warning", text: "ojo" }]);
    expect(items.map((i) => i.kind)).toEqual(["activity", "part", "part"]);
  });

  it("ignora texto vacío y razonamiento vacío después del primero", () => {
    const items = groupParts([{ type: "reasoning", text: "" }, { type: "text", text: "  " }, { type: "reasoning", text: "" }, tool("t")]);
    expect(items).toHaveLength(1);
    const box = items[0];
    expect(box.kind === "activity" && box.entries.map((e) => e.kind)).toEqual(["reasoning", "tool"]);
  });
});
