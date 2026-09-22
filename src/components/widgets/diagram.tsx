"use client";

import type { WidgetOf } from "@/lib/widgets";
import { useWidth } from "./use-width";
import styles from "./widgets.module.css";

type Diagram = WidgetOf<"diagram">;

const NODE_W = 124;
const NODE_H = 50;
const GAP_X = 36;
const GAP_Y = 30;

/**
 * Acomoda los nodos por capas: cada nodo va una columna a la derecha del
 * más lejano de sus padres. Primero descarta las aristas que cierran ciclos
 * para que el orden exista. En `vertical` las capas van hacia abajo.
 */
export function layoutDiagram(diagram: Pick<Diagram, "nodes" | "edges">, vertical = false) {
  const out = new Map<string, string[]>(diagram.nodes.map((n) => [n.id, []]));
  for (const e of diagram.edges) out.get(e.from)?.push(e.to);
  const state = new Map<string, "open" | "done">();
  const dag: { from: string; to: string }[] = [];
  const order: string[] = [];
  const visit = (id: string) => {
    state.set(id, "open");
    for (const to of out.get(id) ?? []) {
      if (state.get(to) === "open") continue;
      dag.push({ from: id, to });
      if (!state.has(to)) visit(to);
    }
    state.set(id, "done");
    order.push(id);
  };
  for (const n of diagram.nodes) if (!state.has(n.id)) visit(n.id);
  const layer = new Map<string, number>(diagram.nodes.map((n) => [n.id, 0]));
  for (const id of order.reverse()) {
    for (const e of dag) if (e.from === id) layer.set(e.to, Math.max(layer.get(e.to)!, layer.get(id)! + 1));
  }
  const rows = new Map<number, number>();
  const slot = new Map<string, { col: number; row: number }>();
  for (const n of diagram.nodes) {
    const col = layer.get(n.id) ?? 0;
    const row = rows.get(col) ?? 0;
    rows.set(col, row + 1);
    slot.set(n.id, { col, row });
  }
  const cols = Math.max(...layer.values()) + 1;
  const maxRows = Math.max(...rows.values());
  const pos = new Map<string, { x: number; y: number }>();
  for (const [id, { col, row }] of slot) {
    if (vertical) {
      const offset = ((maxRows - rows.get(col)!) * (NODE_W + GAP_X)) / 2;
      pos.set(id, { x: offset + row * (NODE_W + GAP_X), y: col * (NODE_H + GAP_Y) });
    } else {
      pos.set(id, { x: col * (NODE_W + GAP_X), y: row * (NODE_H + GAP_Y) });
    }
  }
  return vertical
    ? { pos, width: maxRows * NODE_W + (maxRows - 1) * GAP_X, height: cols * NODE_H + (cols - 1) * GAP_Y }
    : { pos, width: cols * NODE_W + (cols - 1) * GAP_X, height: maxRows * NODE_H + (maxRows - 1) * GAP_Y };
}

function edgePath(a: { x: number; y: number }, b: { x: number; y: number }, vertical: boolean) {
  if (vertical && a.y !== b.y) {
    const x1 = a.x + NODE_W / 2;
    const y1 = a.y + NODE_H;
    const x2 = b.x + NODE_W / 2;
    const y2 = b.y;
    if (x1 === x2) return `M${x1},${y1} L${x2},${y2}`;
    const mid = (y1 + y2) / 2;
    return `M${x1},${y1} L${x1},${mid} L${x2},${mid} L${x2},${y2}`;
  }
  if (a.x === b.x) {
    const x = a.x + NODE_W / 2;
    const [top, bottom] = a.y < b.y ? [a.y + NODE_H, b.y] : [a.y, b.y + NODE_H];
    return `M${x},${top} L${x},${bottom}`;
  }
  const x1 = a.x + NODE_W;
  const y1 = a.y + NODE_H / 2;
  const x2 = b.x;
  const y2 = b.y + NODE_H / 2;
  if (y1 === y2) return `M${x1},${y1} L${x2},${y2}`;
  const mid = (x1 + x2) / 2;
  return `M${x1},${y1} L${mid},${y1} L${mid},${y2} L${x2},${y2}`;
}

/**
 * Diagrama de flujo simple con nodos de colores y flechas.
 */
export function DiagramWidget({ widget }: { widget: Diagram }) {
  const [ref, available] = useWidth<HTMLDivElement>(640);
  const pad = 8;
  const vertical = layoutDiagram(widget).width + pad * 2 > available;
  const { pos, width, height } = layoutDiagram(widget, vertical);
  return (
    <div className={styles.card}>
      {widget.title && <h3 className={styles.title}>{widget.title}</h3>}
      <div className={styles.diagram} ref={ref}>
        <div style={{ position: "relative", width: width + pad * 2, height: height + pad * 2, margin: "0 auto" }}>
          <svg width={width + pad * 2} height={height + pad * 2} aria-hidden="true">
            <defs>
              <marker id="nexo-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="var(--text-3)" />
              </marker>
            </defs>
            <g transform={`translate(${pad} ${pad})`}>
              {widget.edges.map((e, i) => {
                const a = pos.get(e.from);
                const b = pos.get(e.to);
                if (!a || !b) return null;
                return <path key={i} d={edgePath(a, b, vertical)} fill="none" stroke="var(--text-3)" strokeWidth={1.5} markerEnd="url(#nexo-arrow)" />;
              })}
            </g>
          </svg>
          {widget.nodes.map((n) => {
            const p = pos.get(n.id)!;
            return (
              <div
                key={n.id}
                className={styles.node}
                data-tone={n.tone}
                style={{ left: p.x + pad, top: p.y + pad, width: NODE_W, height: NODE_H }}
              >
                <strong>{n.label}</strong>
                {n.detail && <small>{n.detail}</small>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
