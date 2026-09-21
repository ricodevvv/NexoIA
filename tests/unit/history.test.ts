import { describe, expect, it } from "vitest";
import { splitAssistant } from "@/lib/ai/history";
import { applyEvent } from "@/lib/ai/parts";
import type { MessagePart } from "@/lib/ai/types";

describe("splitAssistant", () => {
  it("separa texto y llamadas a tools en tramos en orden", () => {
    const parts: MessagePart[] = [
      { type: "reasoning", text: "pienso" },
      { type: "text", text: "Voy a buscar. " },
      { type: "tool_call", id: "a", name: "x__y", input: {}, output: "1" },
      { type: "tool_call", id: "b", name: "x__z", input: {}, output: "2" },
      { type: "text", text: "Listo." },
    ];
    const segments = splitAssistant(parts);
    expect(segments).toHaveLength(2);
    expect(segments[0].text).toBe("Voy a buscar. ");
    expect(segments[0].calls.map((c) => c.id)).toEqual(["a", "b"]);
    expect(segments[1]).toEqual({ text: "Listo.", calls: [] });
  });

  it("ignora tools de servidor porque no se pueden reenviar a otro proveedor", () => {
    const parts: MessagePart[] = [
      { type: "tool_call", id: "s", name: "web_search", input: {}, output: "r", server: true },
      { type: "text", text: "Encontré esto." },
    ];
    expect(splitAssistant(parts)).toEqual([{ text: "Encontré esto.", calls: [] }]);
  });
});

describe("applyEvent", () => {
  it("junta deltas seguidos del mismo tipo en una sola parte", () => {
    let parts: MessagePart[] = [];
    parts = applyEvent(parts, { type: "text", delta: "Hola " });
    parts = applyEvent(parts, { type: "text", delta: "mundo" });
    parts = applyEvent(parts, { type: "reasoning", delta: "hmm" });
    parts = applyEvent(parts, { type: "text", delta: "!" });
    expect(parts).toEqual([
      { type: "text", text: "Hola mundo" },
      { type: "reasoning", text: "hmm" },
      { type: "text", text: "!" },
    ]);
  });

  it("pega el resultado y los archivos a su llamada sin mutar el arreglo original", () => {
    const before: MessagePart[] = [{ type: "tool_call", id: "t1", name: "run_python", input: { code: "1" } }];
    const files = [{ attachmentId: "f", name: "figura_1.png", mediaType: "image/png" }];
    const after = applyEvent(before, { type: "tool_result", result: { id: "t1", name: "run_python", output: "ok", isError: false, files } });
    expect(before[0]).not.toHaveProperty("output");
    expect(after[0]).toMatchObject({ output: "ok", isError: false, files });
  });
});

describe("speakableText", async () => {
  const { speakableText } = await import("@/components/chat/speak-button");
  it("quita formato y código para leer en voz alta", () => {
    const md = "## Título\n\nMira **esto** y [la guía](https://x.dev).\n\n```ts\nconst a = 1;\n```\n\n- uno\n- dos";
    const spoken = speakableText(md);
    expect(spoken).toContain("Título. Mira esto y la guía.");
    expect(spoken).toContain("(bloque de código)");
    expect(spoken).toMatch(/uno dos$/);
    expect(spoken).not.toMatch(/\.\s*\.|\*|https|const a|#/);
  });
});
