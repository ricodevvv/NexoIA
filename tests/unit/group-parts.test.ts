import { describe, expect, it } from "vitest";
import { activitySummary, diffStats } from "@/components/chat/activity";
import { groupParts, type ActivityEntry } from "@/components/chat/group-parts";
import { parseAnswers } from "@/components/code/question-card";
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

  it("deja los widgets fuera de la caja salvo que hayan fallado", () => {
    const ok: MessagePart = { type: "tool_call", id: "w", name: "show_widget", input: {}, output: "ok" };
    const bad: MessagePart = { type: "tool_call", id: "w2", name: "show_widget", input: {}, output: "mal", isError: true };
    expect(groupParts([ok, bad]).map((i) => i.kind)).toEqual(["part", "activity"]);
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

describe("preguntas del agente", () => {
  it("deja la pregunta respondida fuera de la caja y la pendiente adentro", () => {
    const answered: MessagePart = { type: "tool_call", id: "q", name: "question", input: {}, output: 'User has answered your questions: "¿Versión?"="1.21".' };
    const pending: MessagePart = { type: "tool_call", id: "q2", name: "question", input: {} };
    expect(groupParts([answered]).map((i) => i.kind)).toEqual(["part"]);
    expect(groupParts([pending]).map((i) => i.kind)).toEqual(["activity"]);
  });

  it("saca cada respuesta del texto de nexocode", () => {
    const answers = parseAnswers('User has answered your questions: "¿Hago commit a main?"="Sí, commit a main", "¿Rama?"="Unanswered". You can now continue.');
    expect(answers.get("¿Hago commit a main?")).toBe("Sí, commit a main");
    expect(answers.get("¿Rama?")).toBe("Unanswered");
  });
});

describe("resumen de actividad", () => {
  const bash = (command: string): ActivityEntry => ({ kind: "tool", index: 0, part: { type: "tool_call", id: command, name: "bash", input: { command }, output: "ok" } });

  it("dice a qué rama se subieron los cambios", () => {
    expect(activitySummary([bash("git push origin main")])).toBe("Ejecutó 1 comando, envió a main");
    expect(activitySummary([bash("git add . && git commit -m x && git push -u origin feat/login")])).toBe("Ejecutó 1 comando, envió a feat/login");
    expect(activitySummary([bash("git push")])).toBe("Ejecutó 1 comando, subió los cambios");
    expect(activitySummary([bash("npm test")])).toBe("Ejecutó 1 comando");
  });

  it("suma las líneas agregadas y quitadas", () => {
    const edit: ActivityEntry = { kind: "tool", index: 1, part: { type: "tool_call", id: "e", name: "edit", input: {}, output: "ok", diff: "--- a\n+++ b\n+uno\n+dos\n-tres\n contexto" } };
    const write: ActivityEntry = { kind: "tool", index: 2, part: { type: "tool_call", id: "w", name: "write", input: { content: "a\nb\nc" }, output: "ok" } };
    expect(diffStats([edit, write])).toEqual({ added: 5, removed: 1 });
  });
});
