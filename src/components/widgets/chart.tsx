"use client";

import { BarChart3, LineChart, Table2 } from "lucide-react";
import { useState } from "react";
import type { WidgetOf } from "@/lib/widgets";
import styles from "./widgets.module.css";

export const SERIES_COLORS = ["#3b82f6", "#e0703f", "#22c55e", "#a855f7", "#eab308", "#ec4899"];

const W = 640;
const H = 260;
const PAD = { top: 12, right: 12, bottom: 28, left: 44 };

/**
 * Escala "bonita" para el eje Y: pasos de 1, 2 o 5 por potencia de diez,
 * el que deje más cerca de `count` divisiones.
 */
export function niceTicks(min: number, max: number, count = 6) {
  const lo = Math.min(0, min);
  const span = Math.max(max - lo, 1e-9);
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10]
    .map((m) => m * pow)
    .reduce((best, s) => (Math.abs(span / s - count) < Math.abs(span / best - count) ? s : best));
  const start = Math.floor(lo / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.999; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

function fmt(n: number) {
  return Math.abs(n) >= 1000 ? n.toLocaleString("es") : String(Number(n.toFixed(2)));
}

/**
 * Gráfica de líneas o barras con tooltip, leyenda y vista de tabla.
 */
export function ChartWidget({ widget }: { widget: WidgetOf<"chart"> }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const [hover, setHover] = useState<number | null>(null);
  const { categories, series, kind } = widget;
  const all = series.flatMap((s) => s.values);
  const ticks = niceTicks(Math.min(...all), Math.max(...all));
  const yMin = ticks[0];
  const yMax = ticks.at(-1)!;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / categories.length;
  const x = (i: number) => (kind === "bar" ? PAD.left + slot * (i + 0.5) : PAD.left + (innerW * i) / (categories.length - 1));
  const y = (v: number) => PAD.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;
  const barW = Math.min(28, (slot * 0.7) / series.length);
  const ChartIcon = kind === "bar" ? BarChart3 : LineChart;

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <div>
          <h3 className={styles.title}>{widget.title}</h3>
          {widget.subtitle && <p className={styles.subtitle}>{widget.subtitle}</p>}
        </div>
        <div className={styles.segmented} role="group" aria-label="Vista">
          <button type="button" aria-pressed={view === "chart"} aria-label="Gráfica" onClick={() => setView("chart")}>
            <ChartIcon size={15} />
          </button>
          <button type="button" aria-pressed={view === "table"} aria-label="Tabla" onClick={() => setView("table")}>
            <Table2 size={15} />
          </button>
        </div>
      </div>

      {view === "chart" ? (
        <div className={styles.chartWrap} onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={widget.title}>
            {ticks.map((t) => (
              <g key={t}>
                <line className={styles.grid} x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
                <text className={styles.axis} x={PAD.left - 8} y={y(t) + 4} textAnchor="end">
                  {fmt(t)}
                </text>
              </g>
            ))}
            {categories.map((c, i) => (
              <text key={c + i} className={styles.axis} x={x(i)} y={H - 8} textAnchor="middle">
                {c}
              </text>
            ))}
            {hover !== null && kind === "line" && (
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--text-3)" strokeDasharray="3 3" />
            )}
            {kind === "line"
              ? series.map((s, si) => (
                  <g key={s.name}>
                    <path
                      d={s.values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ")}
                      fill="none"
                      stroke={SERIES_COLORS[si % SERIES_COLORS.length]}
                      strokeWidth={2}
                      strokeLinejoin="round"
                    />
                    {s.values.map((v, i) => (
                      <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 4.5 : 3} fill={SERIES_COLORS[si % SERIES_COLORS.length]} />
                    ))}
                  </g>
                ))
              : series.map((s, si) =>
                  s.values.map((v, i) => {
                    const left = x(i) - (barW * series.length) / 2 + si * barW;
                    const top = y(Math.max(v, 0));
                    return (
                      <rect
                        key={`${si}-${i}`}
                        x={left + 1}
                        y={top}
                        width={barW - 2}
                        height={Math.abs(y(v) - y(0))}
                        rx={3}
                        fill={SERIES_COLORS[si % SERIES_COLORS.length]}
                        opacity={hover === null || hover === i ? 1 : 0.5}
                      />
                    );
                  }),
                )}
            {categories.map((c, i) => (
              <rect
                key={`hit-${i}`}
                x={kind === "bar" ? PAD.left + slot * i : x(i) - innerW / (categories.length - 1) / 2}
                y={PAD.top}
                width={kind === "bar" ? slot : innerW / (categories.length - 1)}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onTouchStart={() => setHover(i)}
              />
            ))}
          </svg>
          {hover !== null && (
            <div className={styles.tooltip} style={{ left: `${(x(hover) / W) * 100}%` }}>
              <p>{categories[hover]}</p>
              {series.map((s, si) => (
                <div key={s.name} className={styles.tooltipRow}>
                  <span className={styles.swatch} style={{ background: SERIES_COLORS[si % SERIES_COLORS.length] }} />
                  <b>{fmt(s.values[hover])}</b> {s.name}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.table}>
          <table>
            <thead>
              <tr>
                <th>Categoría</th>
                {series.map((s) => (
                  <th key={s.name}>{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((c, i) => (
                <tr key={c + i}>
                  <td>{c}</td>
                  {series.map((s) => (
                    <td key={s.name}>{fmt(s.values[i])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.legend}>
        {series.map((s, si) => (
          <span key={s.name}>
            <span className={styles.swatch} style={{ background: SERIES_COLORS[si % SERIES_COLORS.length] }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
