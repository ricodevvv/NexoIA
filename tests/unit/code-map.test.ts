import { describe, expect, it } from "vitest";
import { codeToolTitle } from "@/components/code/code-tools";
import { applyNcEvent, initialState, type NcMessage, toUIMessages } from "@/components/code/map";

const user: NcMessage = { info: { id: "msg_1", role: "user", time: { created: 1 } }, parts: [{ id: "prt_1", messageID: "msg_1", type: "text", text: "hola" }] };

describe("mapeo de sesiones de nexocode", () => {
  it("junta los pasos seguidos del asistente en una sola respuesta", () => {
    let state = initialState([user]);
    state = applyNcEvent(state, { type: "message.updated", properties: { info: { id: "msg_2", role: "assistant", time: { created: 2 } } } });
    state = applyNcEvent(state, {
      type: "message.part.updated",
      properties: { part: { id: "prt_2", messageID: "msg_2", type: "tool", tool: "bash", callID: "c1", state: { status: "completed", input: { command: "ls" }, output: "a.txt" } } },
    });
    state = applyNcEvent(state, { type: "message.updated", properties: { info: { id: "msg_3", role: "assistant", time: { created: 3 } } } });
    state = applyNcEvent(state, { type: "message.part.delta", properties: { messageID: "msg_3", partID: "prt_3", field: "text", delta: "Lis" } });
    state = applyNcEvent(state, { type: "message.part.delta", properties: { messageID: "msg_3", partID: "prt_3", field: "text", delta: "to" } });

    const ui = toUIMessages(state);
    expect(ui.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(ui[1].parts).toEqual([
      { type: "tool_call", id: "c1", name: "bash", input: { command: "ls" }, output: "a.txt", isError: false, diff: undefined },
      { type: "text", text: "Listo" },
    ]);
  });

  it("deja la tool sin salida mientras corre y marca los errores", () => {
    const running = initialState([
      {
        info: { id: "msg_2", role: "assistant", time: { created: 2 } },
        parts: [
          { id: "prt_a", messageID: "msg_2", type: "tool", tool: "edit", callID: "c1", state: { status: "running", input: { filePath: "/p/app.js" } } },
          { id: "prt_b", messageID: "msg_2", type: "tool", tool: "bash", callID: "c2", state: { status: "error", input: {}, error: "falló" } },
        ],
      },
    ]);
    const [a, b] = toUIMessages(running)[0].parts;
    expect(a.type === "tool_call" && a.output).toBeUndefined();
    expect(b.type === "tool_call" && b.isError && b.output).toBe("falló");
  });

  it("pone títulos en español a las tools de código", () => {
    const part = { type: "tool_call" as const, id: "x", name: "edit", input: { filePath: "/p/src/app.ts" } };
    expect(codeToolTitle(part, true)).toBe("Editando app.ts");
    expect(codeToolTitle({ ...part, output: "ok" }, false)).toBe("Editó app.ts");
    expect(codeToolTitle({ ...part, name: "bash", input: { command: "ls", description: "Lista archivos" }, output: "" }, false)).toBe("Lista archivos");
  });
});
