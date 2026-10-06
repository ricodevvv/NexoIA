const numberFmt = new Intl.NumberFormat("es");
const compactFmt = new Intl.NumberFormat("es", { notation: "compact", maximumFractionDigits: 1 });

export function formatNumber(n: number) {
  return numberFmt.format(n);
}

export function formatCompact(n: number) {
  return compactFmt.format(n);
}

/**
 * Dólares con la precisión que tenga sentido: centavos para montos normales y
 * más decimales para los muy chicos.
 */
export function formatCost(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${numberFmt.format(Math.round(n))}`;
}

export function formatLatency(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * "hace 5 min", "ayer", "hace 3 días"... o la fecha si pasó más de un mes.
 */
export function timeAgo(iso: string | null, now = Date.now()) {
  if (!iso) return "Nunca";
  const diff = Math.max(0, now - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "Hace un momento";
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86_400) return `Hace ${Math.floor(diff / 3600)} h`;
  if (diff < 172_800) return "Ayer";
  if (diff < 30 * 86_400) return `Hace ${Math.floor(diff / 86_400)} días`;
  return formatDate(iso);
}

/**
 * Cambio porcentual contra el periodo anterior; null si no hay con qué comparar.
 */
export function percentChange(current: number, previous: number) {
  if (!previous) return current ? null : 0;
  return ((current - previous) / previous) * 100;
}
