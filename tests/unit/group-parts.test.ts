import { describe, expect, it } from "vitest";
import { groupParts } from "@/components/chat/group-parts";
import type { MessagePart } from "@/lib/ai/types";

const search = (id: string): MessagePart => ({ type: "tool_call", id, name: "web_search", input: { query: id }, server: true, output: "ok" });
const fetchPage = (id: string): MessagePart => ({ type: "tool_call", id, name: "web_fetch", input: { url: `https://${id}.dev` }, server: true, output: "ok" });

describe("groupParts", () => {
  it("agrupa búsquedas y lecturas seguidas aunque haya razonamiento en medio", () => {
    const items = groupParts([
      { type: "text", text: "Voy a investigar." },
      search("a"),
      { type: "reasoning", text: "sigo" },
      search("b"),
      fetchPage("c"),
      { type: "text", text: "Informe" },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["part", "web", "part"]);
    const web = items[1];
    expect(web.kind === "web" && web.calls.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("deja una búsqueda suelta como fila normal", () => {
    const items = groupParts([search("solo"), { type: "text", text: "listo" }]);
    expect(items.map((i) => i.kind)).toEqual(["part", "part"]);
  });

  it("no toca otras tools", () => {
    const mcp: MessagePart = { type: "tool_call", id: "m", name: "reloj__get_time", input: {} };
    expect(groupParts([mcp, search("a"), search("b")]).map((i) => i.kind)).toEqual(["part", "web"]);
  });
});
