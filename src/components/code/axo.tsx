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
