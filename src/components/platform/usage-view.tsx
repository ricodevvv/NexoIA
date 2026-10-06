"use client";

import { Coins, Download, Gauge, MessagesSquare, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Breakdown, RangeId, UsageReport } from "@/lib/platform/analytics";
import { AreaLine, StackedColumns } from "../charts/charts";
import { PageHeader } from "../ui/page-header";
import { Segmented } from "../ui/segmented";
import { StatCard } from "../ui/stat-card";
import { formatCompact, formatCost, formatLatency, formatNumber, percentChange } from "../ui/format";
import { dayLabel, sourceColumns } from "./overview";

type Metric = "requests" | "tokens" | "cost";

const RANGE_OPTIONS: { value: RangeId; label: string }[] = [
  { value: "24h", label: "24 h" },
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "90d", label: "90 días" },
];

const RANGE_TEXT: Record<RangeId, string> = { "24h": "las últimas 24 horas", "7d": "los últimos 7 días", "30d": "los últimos 30 días", "90d": "los últimos 90 días" };

function BreakdownTable({ title, rows, empty }: { title: string; rows: Breakdown[]; empty: string }) {
  return (
    <section className="card" aria-label={title}>
      <div className="card-head">
        <h2 className="card-title">{title}</h2>
      </div>
      <div className="card-body flush">
        {rows.length ? (
          <div className="table-wrap">
            <table className="table stack-sm">
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col" className="num">
                    Peticiones
                  </th>
                  <th scope="col" className="num">
                    Entrada
                  </th>
                  <th scope="col" className="num">
                    Salida
                  </th>
                  <th scope="col" className="num">
                    Costo
                  </th>
                  <th scope="col" className="num">
                    Latencia
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <th scope="row">{r.label}</th>
                    <td className="num" data-label="Peticiones">
                      {formatNumber(r.requests)}
                    </td>
                    <td className="num" data-label="Entrada">
                      {formatCompact(r.inputTokens)}
                    </td>
                    <td className="num" data-label="Salida">
                      {formatCompact(r.outputTokens)}
                    </td>
                    <td className="num" data-label="Costo">
                      {formatCost(r.cost)}
                    </td>
                    <td className="num" data-label="Latencia">
                      {formatLatency(r.avgLatencyMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted" style={{ padding: "4px 18px 18px" }}>
            {empty}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Vista de uso: rango de fechas arriba, métricas, la gráfica de la métrica
 * elegida (o su tabla) y los desgloses por modelo, origen y key.
 */
export function UsageView({ report }: { report: UsageReport }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [metric, setMetric] = useState<Metric>("requests");
  const [view, setView] = useState<"chart" | "table">("chart");
  const { totals, previous } = report;
  const columns = sourceColumns(report);
  const metricPoints = report.series.map((p) => ({
    label: dayLabel(p.day),
    value: metric === "tokens" ? p.inputTokens + p.outputTokens : p.cost,
  }));

  function setRange(range: RangeId) {
    startTransition(() => router.push(`/platform/usage?range=${range}`, { scroll: false }));
  }

  return (
    <div className="page">
      <div className="page-inner">
        <PageHeader
          eyebrow="Plataforma"
          title="Uso y costos"
          description={`Peticiones, tokens y costo estimado de ${RANGE_TEXT[report.range]}. El costo usa los precios públicos de cada proveedor.`}
          actions={
            <a className="btn" href={`/api/platform/usage?range=${report.range}`} download>
              <Download size={15} aria-hidden="true" /> Exportar CSV
            </a>
          }
        />

        <div className="toolbar">
          <Segmented value={report.range} onChange={setRange} label="Rango de fechas" options={RANGE_OPTIONS} />
        </div>

        <div style={{ opacity: pending ? 0.55 : 1, transition: "opacity 0.2s" }}>
          <div className="grid-kpi">
            <StatCard label="Peticiones" icon={<MessagesSquare aria-hidden="true" />} value={formatNumber(totals.requests)} change={percentChange(totals.requests, previous.requests)} hint="vs. periodo anterior" />
            <StatCard
              label="Tokens"
              icon={<Gauge aria-hidden="true" />}
              value={formatCompact(totals.inputTokens + totals.outputTokens)}
              change={percentChange(totals.inputTokens + totals.outputTokens, previous.inputTokens + previous.outputTokens)}
              hint={`${formatCompact(totals.inputTokens)} / ${formatCompact(totals.outputTokens)}`}
            />
            <StatCard label="Costo estimado" icon={<Coins aria-hidden="true" />} value={formatCost(totals.cost)} change={percentChange(totals.cost, previous.cost)} goodWhenUp={false} />
            <StatCard
              label="Latencia media"
              icon={<Timer aria-hidden="true" />}
              value={formatLatency(totals.avgLatencyMs)}
              hint={`${totals.errors} ${totals.errors === 1 ? "error" : "errores"}`}
            />
          </div>

          <section className="card" style={{ marginTop: 16 }} aria-labelledby="grafica-uso">
            <div className="card-head">
              <h2 id="grafica-uso" className="card-title">
                {metric === "requests" ? "Peticiones por día" : metric === "tokens" ? "Tokens por día" : "Costo estimado por día"}
              </h2>
              <span className="spacer" />
              <Segmented
                value={metric}
                onChange={setMetric}
                label="Métrica"
                options={[
                  { value: "requests", label: "Peticiones" },
                  { value: "tokens", label: "Tokens" },
                  { value: "cost", label: "Costo" },
                ]}
              />
              <Segmented
                value={view}
                onChange={setView}
                label="Vista"
                options={[
                  { value: "chart", label: "Gráfica" },
                  { value: "table", label: "Tabla" },
                ]}
              />
            </div>
            <div className="card-body">
              {view === "table" ? (
                <div className="table-wrap" style={{ maxHeight: 360 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Día</th>
                        <th scope="col" className="num">
                          Peticiones
                        </th>
                        <th scope="col" className="num">
                          Chat
                        </th>
                        <th scope="col" className="num">
                          API
                        </th>
                        <th scope="col" className="num">
                          Playground
                        </th>
                        <th scope="col" className="num">
                          Tokens
                        </th>
                        <th scope="col" className="num">
                          Costo
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...report.series].reverse().map((p) => (
                        <tr key={p.day}>
                          <th scope="row">{dayLabel(p.day)}</th>
                          <td className="num">{formatNumber(p.requests)}</td>
                          <td className="num">{formatNumber(p.bySource.chat)}</td>
                          <td className="num">{formatNumber(p.bySource.api)}</td>
                          <td className="num">{formatNumber(p.bySource.playground)}</td>
                          <td className="num">{formatCompact(p.inputTokens + p.outputTokens)}</td>
                          <td className="num">{formatCost(p.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : metric === "requests" ? (
                <StackedColumns points={columns.points} series={columns.series} label="Peticiones por día y origen" format={formatCompact} height={260} />
              ) : (
                <AreaLine
                  points={metricPoints}
                  name={metric === "tokens" ? "Tokens" : "Costo"}
                  label={metric === "tokens" ? "Tokens por día" : "Costo estimado por día"}
                  format={metric === "cost" ? (n) => formatCost(n) : formatCompact}
                  height={260}
                />
              )}
            </div>
          </section>

          <div className="stack" style={{ marginTop: 16 }}>
            <BreakdownTable title="Por modelo" rows={report.byModel} empty="Sin uso en este rango." />
            <div className="grid-2">
              <BreakdownTable title="Por origen" rows={report.bySource} empty="Sin uso en este rango." />
              <BreakdownTable title="Por API key" rows={report.byKey} empty="Ninguna API key se usó en este rango." />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
