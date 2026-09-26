"use client";

import { useEffect, useState } from "react";
import styles from "./axo.module.css";

const FRONT = [
  ".g............g.",
  "..gBBBBBBBBBBg..",
  "gggBBBBBBBBBBggg",
  "...BBEBBBBEBB...",
  "..gBpBBMMBBpBg..",
  "BBBBBBBBBBBBBBBB",
  "...BBBBBBBBBB...",
  "....BB....BB....",
];

const COLORS: Record<string, string> = {
  B: "#F0719E",
  A: "#F0719E",
  S: "#D4588A",
  g: "#B8336B",
  p: "#FFB3CD",
  E: "#1E0F16",
  M: "#1E0F16",
  k: "#A89AA2",
  j: "#6E5F68",
};

/**
 * Axo, el ajolote de Nexo Code, en pixel art. Parpadea de vez en cuando.
 */
export function Axo({ size = 64, className }: { size?: number; className?: string }) {
  const pixels = FRONT.flatMap((row, y) => [...row].map((c, x) => ({ c, x, y })).filter((p) => p.c !== "."));
  return (
    <svg width={size} height={size / 2} viewBox="0 0 16 8" className={className} role="img" aria-label="Axo" shapeRendering="crispEdges">
      {pixels.map((p) => (
        <rect key={`${p.x}-${p.y}`} x={p.x} y={p.y} width="1.02" height="1.02" fill={COLORS[p.c]} data-eye={p.c === "E" || undefined} />
      ))}
    </svg>
  );
}

const LEGS = ["....BB....BB....", "...BB......BB..."];

function pixelsOf(rows: string[], top = 0) {
  return rows.flatMap((row, y) => [...row].map((c, x) => ({ c, x, y: y + top })).filter((p) => p.c !== "."));
}

/**
 * Axo caminando de un lado a otro mientras algo carga: alterna las patas,
 * rebota con cada paso y se voltea al llegar a la orilla. Con movimiento
 * reducido se queda quieto.
 */
export function AxoLoading({ label = "Cargando mensajes" }: { label?: string }) {
  const body = pixelsOf(FRONT.slice(0, 7));
  const rect = (p: { c: string; x: number; y: number }) => (
    <rect key={`${p.x}-${p.y}`} x={p.x} y={p.y} width="1.02" height="1.02" fill={COLORS[p.c]} data-eye={p.c === "E" || undefined} />
  );
  return (
    <div className={styles.loading} role="status">
      <div className={styles.track}>
        <svg width={72} height={36} viewBox="0 0 16 8" className={styles.walker} aria-hidden="true" shapeRendering="crispEdges">
          <g className={styles.bob}>{body.map(rect)}</g>
          {LEGS.map((row, i) => (
            <g key={row} className={styles.legs} data-step={i}>
              {pixelsOf([row], 7).map(rect)}
            </g>
          ))}
        </svg>
      </div>
      <span className={styles.label}>{label}</span>
    </div>
  );
}

const TURN = [
  "..g...........g.",
  "...SBBBBBBBBBg..",
  ".ggSBBBBBBBBBggg",
  "...SBBEBBBBEB...",
  "...SBBBBMMBpBg..",
  "...SBBBBBBBBBBBB",
  "...SBBBBBBBBB...",
  "....SB....BB....",
];

const PROFILE = [
  "..g.................",
  "...gSSSSBBBBB.......",
  ".gggSSSSBBBBB.......",
  "...gSSSSBBEBEB......",
  "....SSSSBBBBBM......",
  "SSSSSSSSBBBBBAAAA...",
  ".SS.SSSSBBBBB......k",
  ".....SS...BB..kkkkk.",
];

function pad(frame: string[]) {
  return frame.map((row) => row.padEnd(20, "."));
}

function edit(frame: string[], changes: [number, number, string][]) {
  return frame.map((row, y) =>
    changes
      .filter((change) => change[0] === y)
      .reduce((line, change) => line.slice(0, change[1]) + change[2] + line.slice(change[1] + change[2].length), row),
  );
}

const F = pad(FRONT);
const Fb = pad(edit(FRONT, [
  [3, 5, "B"],
  [3, 10, "B"],
]));
const T = pad(TURN);
const TH = edit(T, [
  [5, 16, "kkkk"],
  [6, 16, "jjjj"],
]);
const TO = edit(T, [
  [6, 19, "k"],
  [7, 14, "kkkkk"],
]);
const PA = PROFILE;
const PB = edit(PA, [
  [5, 15, ".."],
  [6, 15, "AA"],
]);
const PAb = edit(PA, [
  [3, 10, "B"],
  [3, 12, "B"],
]);
const PC = edit(PA, [
  [5, 15, ".."],
  [6, 19, "."],
  [7, 14, "kkkkkk"],
]);

const LAPTOP = [F, F, F, F, F, Fb, F, F, T, T, TH, TH, TO, TO]
  .concat([PA, PB, PA, PB, PA, PB, PAb, PB, PA, PB, PA, PB, PA, PB, PA, PB])
  .concat([PC, PC, TH, T, F, F]);

const VERBS = ["Ajoloteando", "Nadando entre el código", "Moviendo las branquias", "Regenerando", "Trasteando", "Pensando", "Maquinando", "Remando", "Burbujeando", "Armando"];

function elapsed(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/**
 * Axo sacando la laptop y tecleando, igual que en la terminal de nexocode,
 * con un verbo al azar y cuánto lleva trabajando. Es lo que se ve mientras el
 * agente trabaja. Con movimiento reducido se queda de frente.
 */
export function AxoWorking({ label }: { label?: string }) {
  const [frame, setFrame] = useState(0);
  const [verb] = useState(() => VERBS[Math.floor(Math.random() * VERBS.length)]);
  const [since] = useState(() => Date.now());
  const [now, setNow] = useState(since);

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setInterval(() => {
      if (!still) setFrame((i) => (i + 1) % LAPTOP.length);
      setNow(Date.now());
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const pixels = LAPTOP[frame].flatMap((row, y) => [...row].map((c, x) => ({ c, x, y })).filter((p) => COLORS[p.c]));
  return (
    <div className={styles.working} role="status">
      <svg width={60} height={24} viewBox="0 0 20 8" aria-hidden="true" shapeRendering="crispEdges">
        {pixels.map((p) => (
          <rect key={`${p.x}-${p.y}`} x={p.x} y={p.y} width="1.02" height="1.02" fill={COLORS[p.c]} />
        ))}
      </svg>
      <span className={styles.verb}>{label ?? verb}…</span>
      <span className={styles.elapsed}>({elapsed(Math.floor((now - since) / 1000))})</span>
    </div>
  );
}
