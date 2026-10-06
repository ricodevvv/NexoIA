"use client";

import { useLayoutEffect, useRef, useState } from "react";
import styles from "./charts.module.css";

export type Series = { key: string; name: string; color: string };

type Point = { label: string; values: number[] };

const PAD = { top: 12, right: 8, bottom: 26, left: 44 };
const BAR_MAX = 24;
const GAP = 2;

/**
 * Ancho del contenedor para dibujar el SVG a su tamaño real.
 */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Marcas limpias para el eje: 0, 1, 2, 5 o 10 por la potencia que toque.
 */
export function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Number(v.toPrecision(12)));
  if (ticks.at(-1)! < max) ticks.push(Number((ticks.at(-1)! + step).toPrecision(12)));
  return ticks;
}

export function compact(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className={styles.legend}>
      {series.map((s) => (
        <li key={s.key}>
          <span className={styles.swatch} style={{ background: s.color }} aria-hidden="true" />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

type TooltipState = { x: number; y: number; index: number } | null;

function Tooltip({
  state,
  points,
  series,
  format,
  width,
}: {
  state: TooltipState;
  points: Point[];
  series: Series[];
  format: (n: number) => string;
  width: number;
}) {
  if (!state) return null;
  const point = points[state.index];
  const total = point.values.reduce((a, b) => a + b, 0);
  const left = Math.min(Math.max(state.x, 90), width - 90);
  return (
    <div className={styles.tooltip} style={{ left, top: state.y }} role="status">
      <span className={styles.tooltipTitle}>{point.label}</span>
      {series.length > 1 && (
        <span className={styles.tooltipRow}>
          <strong>{format(total)}</strong>
          <span>Total</span>
        </span>
      )}
      {series.map((s, i) => (
        <span key={s.key} className={styles.tooltipRow}>
          <i style={{ background: s.color }} aria-hidden="true" />
          <strong>{format(point.values[i] ?? 0)}</strong>
          <span>{s.name}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Columnas apiladas por día. Cada columna es su propio objetivo para el
 * puntero y el teclado, y muestra todas las series en el tooltip.
 */
export function StackedColumns({
  points,
  series,
  format = compact,
  height = 220,
  label,
}: {
  points: Point[];
  series: Series[];
  format?: (n: number) => string;
  height?: number;
  label: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<TooltipState>(null);
  const totals = points.map((p) => p.values.reduce((a, b) => a + b, 0));
  const ticks = niceTicks(Math.max(...totals, 0));
  const max = ticks.at(-1) || 1;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const band = points.length ? plotW / points.length : 0;
  const barW = Math.max(2, Math.min(BAR_MAX, band * 0.62));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(plotW / 64))));

  return (
    <div className={styles.chart}>
      <Legend series={series} />
      <div ref={ref} className={styles.frame} style={{ height }} onPointerLeave={() => setTip(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={label}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? styles.axis : styles.grid} />
                <text x={PAD.left - 8} y={y(t)} className={styles.tick} textAnchor="end" dominantBaseline="middle">
                  {format(t)}
                </text>
              </g>
            ))}
            {points.map((p, i) => {
              const cx = PAD.left + band * i + band / 2;
              const x = cx - barW / 2;
              let acc = 0;
              const visible = p.values.map((v, s) => ({ v, s })).filter((d) => d.v > 0);
              return (
                <g
                  key={p.label}
                  className={styles.column}
                  data-active={tip?.index === i}
                  tabIndex={0}
                  aria-label={`${p.label}: ${series.map((s, k) => `${s.name} ${format(p.values[k] ?? 0)}`).join(", ")}`}
                  onPointerMove={() => setTip({ x: cx, y: y(totals[i]) - 8, index: i })}
                  onFocus={() => setTip({ x: cx, y: y(totals[i]) - 8, index: i })}
                  onBlur={() => setTip(null)}
                >
                  <rect x={PAD.left + band * i} y={PAD.top} width={band} height={plotH} className={styles.hit} />
                  {visible.map(({ v, s }, k) => {
                    const top = y(acc + v);
                    const bottom = y(acc);
                    acc += v;
                    const h = Math.max(0, bottom - top - (k > 0 ? GAP : 0));
                    if (h <= 0) return null;
                    const last = k === visible.length - 1;
                    return last ? (
                      <path key={s} d={topRounded(x, top, barW, h, 4)} fill={series[s].color} />
                    ) : (
                      <rect key={s} x={x} y={top} width={barW} height={h} fill={series[s].color} />
                    );
                  })}
                  {i % labelEvery === 0 && (
                    <text x={cx} y={height - 8} className={styles.tick} textAnchor="middle">
                      {p.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        <Tooltip state={tip} points={points} series={series} format={format} width={width} />
      </div>
    </div>
  );
}

/**
 * Línea con área suave para una sola serie en el tiempo, con mira vertical
 * que se pega al punto más cercano.
 */
export function AreaLine({
  points,
  name,
  color = "var(--chart-1)",
  format = compact,
  height = 220,
  label,
}: {
  points: { label: string; value: number }[];
  name: string;
  color?: string;
  format?: (n: number) => string;
  height?: number;
  label: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<TooltipState>(null);
  const ticks = niceTicks(Math.max(...points.map((p) => p.value), 0));
  const max = ticks.at(-1) || 1;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const step = points.length > 1 ? plotW / (points.length - 1) : 0;
  const x = (i: number) => PAD.left + (points.length > 1 ? step * i : plotW / 2);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join("");
  const area = points.length ? `${line}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z` : "";
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(plotW / 64))));
  const series: Series[] = [{ key: "v", name, color }];
  const asPoints = points.map((p) => ({ label: p.label, values: [p.value] }));

  function pick(clientX: number, el: SVGSVGElement) {
    const rect = el.getBoundingClientRect();
    const i = Math.round((clientX - rect.left - PAD.left) / (step || 1));
    const index = Math.max(0, Math.min(points.length - 1, i));
    setTip({ x: x(index), y: y(points[index].value) - 12, index });
  }

  return (
    <div className={styles.chart}>
      <div ref={ref} className={styles.frame} style={{ height }} onPointerLeave={() => setTip(null)}>
        {width > 0 && points.length > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={label}
            tabIndex={0}
            onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const current = tip?.index ?? points.length - 1;
              const index = Math.max(0, Math.min(points.length - 1, current + (e.key === "ArrowRight" ? 1 : -1)));
              setTip({ x: x(index), y: y(points[index].value) - 12, index });
            }}
            onFocus={() => setTip({ x: x(points.length - 1), y: y(points.at(-1)!.value) - 12, index: points.length - 1 })}
            onBlur={() => setTip(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? styles.axis : styles.grid} />
                <text x={PAD.left - 8} y={y(t)} className={styles.tick} textAnchor="end" dominantBaseline="middle">
                  {format(t)}
                </text>
              </g>
            ))}
            <path d={area} fill={color} className={styles.area} />
            <path d={line} stroke={color} className={styles.line} />
            {points.map((p, i) =>
              i % labelEvery === 0 ? (
                <text key={p.label} x={x(i)} y={height - 8} className={styles.tick} textAnchor="middle">
                  {p.label}
                </text>
              ) : null,
            )}
            {tip && (
              <>
                <line x1={tip.x} x2={tip.x} y1={PAD.top} y2={PAD.top + plotH} className={styles.crosshair} />
                <circle cx={tip.x} cy={y(points[tip.index].value)} r={4.5} fill={color} className={styles.dot} />
              </>
            )}
          </svg>
        )}
        <Tooltip state={tip} points={asPoints} series={series} format={format} width={width} />
      </div>
    </div>
  );
}

/**
 * Barras horizontales para un desglose (por modelo, por origen). Son HTML,
 * así el nombre y el valor siempre se leen aunque la barra sea chica.
 */
export function BreakdownBars({
  rows,
  format = compact,
  color = "var(--chart-1)",
}: {
  rows: { key: string; label: string; value: number; hint?: string }[];
  format?: (n: number) => string;
  color?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  const total = rows.reduce((a, r) => a + r.value, 0) || 1;
  return (
    <ul className={styles.breakdown}>
      {rows.map((r) => (
        <li key={r.key}>
          <div className={styles.breakdownHead}>
            <span className={styles.breakdownLabel} title={r.label}>
              {r.label}
            </span>
            <span className={styles.breakdownValue}>
              {format(r.value)} <small>{Math.round((r.value / total) * 100)}%</small>
            </span>
          </div>
          <div className={styles.breakdownTrack}>
            <span style={{ inlineSize: `${(r.value / max) * 100}%`, background: color }} />
          </div>
          {r.hint && <span className={styles.breakdownHint}>{r.hint}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Mini tendencia para las tarjetas de métricas.
 */
export function Sparkline({ values, color = "var(--chart-1)", width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values) || 1;
  const step = width / (values.length - 1);
  const d = values.map((v, i) => `${i ? "L" : "M"}${(step * i).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`).join("");
  return (
    <svg width={width} height={height} className={styles.spark} aria-hidden="true">
      <path d={d} stroke={color} />
    </svg>
  );
}
