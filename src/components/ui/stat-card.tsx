import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Sparkline } from "../charts/charts";

/**
 * Tarjeta de una métrica con su cambio contra el periodo anterior. `goodWhenUp`
 * dice si subir es bueno (peticiones) o malo (errores, latencia).
 */
export function StatCard({
  label,
  icon,
  value,
  change,
  goodWhenUp = true,
  hint,
  trend,
}: {
  label: string;
  icon?: React.ReactNode;
  value: string;
  change?: number | null;
  goodWhenUp?: boolean;
  hint?: string;
  trend?: number[];
}) {
  const trendDir = change === null || change === undefined || Math.abs(change) < 0.5 ? "flat" : change > 0 ? "up" : "down";
  const good = trendDir === "flat" ? "flat" : (trendDir === "up") === goodWhenUp ? "up" : "down";
  return (
    <div className="card stat">
      <span className="stat-label">
        {icon}
        {label}
      </span>
      <span className="stat-value">{value}</span>
      <span className="stat-foot">
        {change !== undefined && (
          <span className="delta" data-trend={good}>
            {trendDir === "up" ? <ArrowUpRight size={12} aria-hidden="true" /> : trendDir === "down" ? <ArrowDownRight size={12} aria-hidden="true" /> : null}
            {change === null ? "Nuevo" : `${change > 0 ? "+" : ""}${change.toFixed(Math.abs(change) < 10 ? 1 : 0)}%`}
          </span>
        )}
        {hint && <span>{hint}</span>}
        {trend && trend.length > 1 && (
          <span style={{ marginLeft: "auto" }}>
            <Sparkline values={trend} />
          </span>
        )}
      </span>
    </div>
  );
}
