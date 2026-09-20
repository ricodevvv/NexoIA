import { describe, expect, it } from "vitest";
import { collectArtifacts, fileName, readArtifact } from "@/components/artifacts/artifacts";
import { buildSrcDoc } from "@/components/artifacts/srcdoc";
import type { MessagePart } from "@/lib/ai/types";

const call = (id: string, input: object, extra: Partial<MessagePart> = {}): MessagePart =>
  ({ type: "tool_call", id, name: "artifact", input, output: "ok", ...extra }) as MessagePart;

describe("artifacts", () => {
  it("agrupa versiones por identifier en orden de aparición", () => {
    const messages = [
      { parts: [call("1", { identifier: "demo", title: "Demo", type: "html", content: "<p>1</p>" })] },
      { parts: [call("2", { identifier: "otro", title: "Otro", type: "svg", content: "<svg/>" })] },
      { parts: [call("3", { identifier: "demo", title: "Demo v2", type: "html", content: "<p>2</p>" })] },
    ];
    const map = collectArtifacts(messages);
    expect(map.get("demo")?.map((v) => v.callId)).toEqual(["1", "3"]);
    expect(map.get("otro")).toHaveLength(1);
  });

  it("descarta llamadas fallidas o sin contenido", () => {
    expect(readArtifact(call("x", { identifier: "a", title: "A", type: "html", content: "hi" }, { isError: true }))).toBeNull();
    expect(readArtifact(call("y", { identifier: "a", title: "A", type: "html" }))).toBeNull();
  });

  it("elige la extensión según el tipo y el lenguaje", () => {
    const base = { callId: "c", identifier: "script", title: "t", content: "" };
    expect(fileName({ ...base, type: "code", language: "Python" })).toBe("script.py");
    expect(fileName({ ...base, type: "react" })).toBe("script.tsx");
    expect(fileName({ ...base, type: "code", language: "cobol" })).toBe("script.txt");
  });

  it("no deja que el código de un artifact React cierre el <script> que lo contiene", () => {
    const doc = buildSrcDoc(
      { callId: "c", identifier: "x", title: "x", type: "react", content: 'export default () => "</script><script>alert(1)</script>"' },
      false,
    );
    const inline = doc.slice(doc.indexOf("const source ="));
    expect(inline).not.toContain("</script><script>alert(1)");
    expect(inline).toContain("\\u003c/script>");
  });

  it("escapa el HTML dentro de los diagramas Mermaid", () => {
    const doc = buildSrcDoc({ callId: "c", identifier: "m", title: "m", type: "mermaid", content: "graph LR; A[<img src=x onerror=alert(1)>]" }, true);
    expect(doc).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(doc).not.toContain("<img src=x");
  });
});
