import { describe, expect, it } from "vitest";
import { niceTicks } from "@/components/widgets/chart";
import { layoutDiagram } from "@/components/widgets/diagram";
import { parseWidget } from "@/lib/widgets";

describe("parseWidget", () => {
  it("acepta una gráfica bien formada", () => {
    const r = parseWidget({ type: "chart", title: "Ventas", categories: ["a", "b"], series: [{ name: "x", values: [1, 2] }] });
    expect(r.ok && r.widget.type === "chart" && r.widget.kind).toBe("line");
  });

  it("rechaza series con distinto número de valores que categorías", () => {
    const r = parseWidget({ type: "chart", title: "Ventas", categories: ["a", "b", "c"], series: [{ name: "x", values: [1, 2] }] });
    expect(r.ok).toBe(false);
  });

  it("rechaza un quiz cuya respuesta no existe", () => {
    const r = parseWidget({ type: "quiz", questions: [{ question: "¿?", options: ["a", "b"], answer: 5 }] });
    expect(r.ok).toBe(false);
  });

  it("rechaza enlaces que no son http", () => {
    const r = parseWidget({ type: "links", links: [{ title: "x", url: "javascript:alert(1)" }] });
    expect(r.ok).toBe(false);
  });

  it("rechaza aristas a nodos que no existen", () => {
    const r = parseWidget({ type: "diagram", nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], edges: [{ from: "a", to: "z" }] });
    expect(r.ok).toBe(false);
  });
});

describe("niceTicks", () => {
  it("usa pasos redondos que cubren el máximo", () => {
    const ticks = niceTicks(80, 620);
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(620);
    expect(ticks[1] - ticks[0]).toBe(100);
  });
});

describe("layoutDiagram", () => {
  it("pone cada nodo a la derecha de su padre más lejano y aguanta ciclos", () => {
    const { pos } = layoutDiagram({
      nodes: ["a", "b", "c", "d"].map((id) => ({ id, label: id, tone: "neutral" as const })),
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "a", to: "c" },
        { from: "c", to: "a" },
        { from: "b", to: "d" },
      ],
    });
    expect(pos.get("b")!.x).toBeGreaterThan(pos.get("a")!.x);
    expect(pos.get("c")!.x).toBeGreaterThan(pos.get("b")!.x);
    expect(pos.get("d")!.x).toBe(pos.get("c")!.x);
  });
});
