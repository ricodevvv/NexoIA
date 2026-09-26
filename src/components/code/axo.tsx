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

const COLORS: Record<string, string> = { B: "#F0719E", g: "#B8336B", p: "#FFB3CD", E: "#1E0F16", M: "#1E0F16" };

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
