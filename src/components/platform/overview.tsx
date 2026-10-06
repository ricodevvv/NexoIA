"use client";

import { AlertTriangle, ArrowRight, Coins, Gauge, KeyRound, MessagesSquare, Terminal, Timer } from "lucide-react";
import Link from "next/link";
import type { LogRow, UsageReport } from "@/lib/platform/analytics";
import { SOURCE_LABEL } from "@/lib/platform/analytics-labels";
import { BreakdownBars, StackedColumns, type Series } from "../charts/charts";
import { PageHeader } from "../ui/page-header";
import { StatCard } from "../ui/stat-card";
import { formatCompact, formatCost, formatLatency, formatNumber, percentChange, timeAgo } from "../ui/format";
import { CodeTabs } from "./code-tabs";
import { StatusTag } from "./tags";

export const SOURCE_SERIES: Series[] = [
  { key: "chat", name: SOURCE_LABEL.chat, color: "var(--chart-1)" },
  { key: "api", name: SOURCE_LABEL.api, color: "var(--chart-2)" },
  { key: "playground", name: SOURCE_LABEL.playground, color: "var(--chart-3)" },
  { key: "code", name: SOURCE_LABEL.code, color: "var(--chart-4)" },
];

export function dayLabel(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("es", { day: "numeric", month: "short" });
}

/**
 * Columnas por día y origen; deja fuera los orígenes que no tuvieron uso para
 * no llenar la leyenda de series vacías, sin repintar las demás.
 */
export function sourceColumns(report: UsageReport) {
  const used = SOURCE_SERIES.filter((s) => report.series.some((p) => p.bySource[s.key as keyof typeof p.bySource] > 0));
  const series = used.length ? used : SOURCE_SERIES.slice(0, 1);
  return {
    series,
    points: report.series.map((p) => ({ label: dayLabel(p.day), values: series.map((s) => p.bySource[s.key as keyof typeof p.bySource]) })),
  };
}

type Props = {
  userName: string;
  report: UsageReport;
  recent: (LogRow & { modelLabel: string })[];
  activeKeys: number;
  baseUrl: string;
  sampleModel: string;
};

/**
 * Resumen de la plataforma: métricas de 30 días, actividad diaria, modelos
 * más usados, últimas peticiones y una guía rápida para la API.
 */
export function Overview({ userName, report, recent, activeKeys, baseUrl, sampleModel }: Props) {
  const { totals, previous } = report;
  const columns = sourceColumns(report);
  const errorRate = totals.requests ? (totals.errors / totals.requests) * 100 : 0;

  return (
    <div className="page">
      <div className="page-inner">
        <PageHeader
          eyebrow="Plataforma"
          title={`Hola, ${userName}`}
          description="Así va tu uso de los últimos 30 días entre el chat, la API y el playground."
          actions={
            <>
              <Link href="/platform/playground" className="btn">
                <Terminal size={15} aria-hidden="true" /> Playground
              </Link>
              <Link href="/platform/keys" className="btn btn-primary">
                <KeyRound size={15} aria-hidden="true" /> Crear API key
              </Link>
            </>
          }
        />

        <div className="grid-kpi">
          <StatCard
            label="Peticiones"
            icon={<MessagesSquare aria-hidden="true" />}
            value={formatNumber(totals.requests)}
            change={percentChange(totals.requests, previous.requests)}
            hint="vs. 30 días antes"
            trend={report.series.map((p) => p.requests)}
          />
          <StatCard
            label="Tokens"
            icon={<Gauge aria-hidden="true" />}
            value={formatCompact(totals.inputTokens + totals.outputTokens)}
            change={percentChange(totals.inputTokens + totals.outputTokens, previous.inputTokens + previous.outputTokens)}
            hint={`${formatCompact(totals.inputTokens)} entrada · ${formatCompact(totals.outputTokens)} salida`}
          />
          <StatCard
            label="Costo estimado"
            icon={<Coins aria-hidden="true" />}
            value={formatCost(totals.cost)}
            change={percentChange(totals.cost, previous.cost)}
            goodWhenUp={false}
            hint="a precio de lista"
          />
          <StatCard
            label="Latencia media"
            icon={<Timer aria-hidden="true" />}
            value={formatLatency(totals.avgLatencyMs)}
            change={totals.avgLatencyMs && previous.avgLatencyMs ? percentChange(totals.avgLatencyMs, previous.avgLatencyMs) : undefined}
            goodWhenUp={false}
            hint={`${errorRate.toFixed(1)}% con error`}
          />
        </div>

        <section className="card" style={{ marginTop: 16 }} aria-labelledby="actividad-diaria">
          <div className="card-head">
            <h2 id="actividad-diaria" className="card-title">
              Actividad diaria
            </h2>
            <span className="spacer" />
            <Link href="/platform/usage" className="btn btn-sm btn-ghost">
              Ver uso completo <ArrowRight size={13} aria-hidden="true" />
            </Link>
            <p className="card-desc">Peticiones por día según de dónde vinieron.</p>
          </div>
          <div className="card-body">
            {totals.requests ? (
              <StackedColumns points={columns.points} series={columns.series} label="Peticiones por día de los últimos 30 días" format={formatCompact} />
            ) : (
              <div className="empty-state">
                <MessagesSquare aria-hidden="true" />
                <h3>Todavía no hay actividad</h3>
                <p>Escribe en el chat, prueba algo en el playground o llama a la API y aquí verás cómo crece.</p>
              </div>
            )}
          </div>
        </section>

        <div className="grid-2" style={{ marginTop: 16 }}>
          <section className="card" aria-labelledby="top-modelos">
            <div className="card-head">
              <h2 id="top-modelos" className="card-title">
                Modelos más usados
              </h2>
              <p className="card-desc">Por número de peticiones.</p>
            </div>
            <div className="card-body">
              {report.byModel.length ? (
                <BreakdownBars
                  rows={report.byModel.slice(0, 5).map((m) => ({
                    key: m.key,
                    label: m.label,
                    value: m.requests,
                    hint: `${formatCompact(m.inputTokens + m.outputTokens)} tokens · ${formatCost(m.cost)}`,
                  }))}
                  format={formatNumber}
                />
              ) : (
                <p className="muted">Sin datos todavía.</p>
              )}
            </div>
          </section>

          <section className="card" aria-labelledby="recientes">
            <div className="card-head">
              <h2 id="recientes" className="card-title">
                Peticiones recientes
              </h2>
              <span className="spacer" />
              <Link href="/platform/logs" className="btn btn-sm btn-ghost">
                Ver logs <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>
            <div className="card-body flush">
              {recent.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Modelo</th>
                        <th scope="col" className="num">
                          Tokens
                        </th>
                        <th scope="col">Estado</th>
                        <th scope="col">Cuándo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((r) => (
                        <tr key={r.id}>
                          <th scope="row">
                            <span className="cell-title">{r.modelLabel}</span>
                            <span className="cell-sub">{SOURCE_LABEL[r.source]}</span>
                          </th>
                          <td className="num">{formatCompact(r.inputTokens + r.outputTokens)}</td>
                          <td>
                            <StatusTag status={r.status} />
                          </td>
                          <td className="muted-cell">{timeAgo(r.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted" style={{ padding: "8px 18px 18px" }}>
                  Aún no hay peticiones.
                </p>
              )}
            </div>
          </section>
        </div>

        <section className="card" style={{ marginTop: 16 }} aria-labelledby="empieza">
          <div className="card-head">
            <h2 id="empieza" className="card-title">
              Usa Nexo desde tu código
            </h2>
            <p className="card-desc">La API es compatible con los SDKs de OpenAI: cambias la URL base y la key, y listo.</p>
          </div>
          <div className="card-body">
            <ol className="steps-list">
              <li>
                <strong>Crea una API key</strong>
                <span>
                  {activeKeys ? `Tienes ${activeKeys} ${activeKeys === 1 ? "key activa" : "keys activas"}.` : "Todavía no tienes ninguna."}{" "}
                  <Link href="/platform/keys">Ir a API keys</Link>
                </span>
              </li>
              <li>
                <strong>Instala el SDK</strong>
                <span>
                  <code className="code-inline">pip install openai</code> o <code className="code-inline">npm i openai</code>
                </span>
              </li>
              <li>
                <strong>Haz tu primera petición</strong>
                <span>Guarda la key en la variable NEXO_API_KEY y corre esto:</span>
              </li>
            </ol>
            <CodeTabs input={{ baseUrl, model: sampleModel, messages: [{ role: "user", content: "Hola, ¿qué puedes hacer?" }] }} />
            {totals.errors > 0 && (
              <p className="callout" data-tone="warning" style={{ marginTop: 14 }}>
                <AlertTriangle aria-hidden="true" />
                <span>
                  {totals.errors} {totals.errors === 1 ? "petición falló" : "peticiones fallaron"} en este periodo.{" "}
                  <Link href="/platform/logs?status=error">Revisa los errores</Link>
                </span>
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
