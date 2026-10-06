import { ArrowUpCircle, Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PLANS } from "@/lib/billing/plans";
import { quotaStatus } from "@/lib/billing/usage";
import { LIMITS } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Límites" };

const RATE_ROWS = [
  { name: "Mensajes del chat", rule: LIMITS.chatUser, scope: "por usuario" },
  { name: "API · por key", rule: LIMITS.api, scope: "por key" },
  { name: "API · por cuenta", rule: LIMITS.apiUser, scope: "sumando todas tus keys" },
  { name: "Playground", rule: LIMITS.playground, scope: "por usuario" },
  { name: "Subida de archivos", rule: LIMITS.upload, scope: "por usuario" },
  { name: "Búsqueda en chats", rule: LIMITS.search, scope: "por usuario" },
  { name: "Conectores MCP", rule: LIMITS.connector, scope: "por usuario" },
  { name: "Exportaciones", rule: LIMITS.export, scope: "por usuario" },
];

function windowText(seconds: number) {
  if (seconds >= 3600) return `${seconds / 3600} h`;
  if (seconds >= 60) return `${seconds / 60} min`;
  return `${seconds} s`;
}

export default async function LimitsPage() {
  const user = await requireUser();
  const quota = await quotaStatus(user.id);
  const plan = PLANS[quota.plan];
  const pct = Math.min(100, Math.round((quota.used / Math.max(1, quota.limit)) * 100));

  return (
    <div className="page">
      <div className="page-inner">
        <PageHeader
          eyebrow="Plataforma"
          title="Límites"
          description="Cuánto puedes usar por día con tu plan y los límites de velocidad que protegen el servicio."
          actions={
            quota.plan === "free" ? (
              <Link href="/settings?tab=billing" className="btn btn-accent">
                <ArrowUpCircle size={15} aria-hidden="true" /> Mejorar a Pro
              </Link>
            ) : undefined
          }
        />

        <div className="grid-2">
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Plan {plan.name}</h2>
              <span className={`tag ${quota.plan === "pro" ? "tag-accent" : ""}`}>{plan.price}</span>
            </div>
            <div className="card-body stack">
              <div>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                  <span className="muted">Mensajes de hoy</span>
                  <strong>
                    {quota.used} / {quota.limit}
                  </strong>
                </div>
                <div className="meter" data-level={pct >= 100 ? "full" : pct >= 80 ? "warn" : undefined} role="meter" aria-valuenow={quota.used} aria-valuemin={0} aria-valuemax={quota.limit} aria-label="Mensajes usados hoy">
                  <span style={{ inlineSize: `${pct}%` }} />
                </div>
                <p className="hint" style={{ marginTop: 8 }}>
                  Se reinicia todos los días a las 00:00 UTC. Cuentan el chat, el playground y la API.
                </p>
              </div>
              <ul className="check-list">
                {plan.features.map((f) => (
                  <li key={f}>
                    <Check aria-hidden="true" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Sin límite diario</h2>
            </div>
            <div className="card-body">
              <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
                Las peticiones que hacen los modelos con tu propia API key de Anthropic, OpenAI o un endpoint compatible no cuentan para el límite del plan.
                Solo aplican los límites de velocidad de abajo y los de tu proveedor.
              </p>
              <Link href="/settings?tab=keys" className="btn" style={{ marginTop: 14 }}>
                Agregar mi key
              </Link>
            </div>
          </section>
        </div>

        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <h2 className="card-title">Límites de velocidad</h2>
            <p className="card-desc">Si te pasas, la respuesta es un 429 con el header Retry-After diciendo cuántos segundos esperar.</p>
          </div>
          <div className="card-body flush">
            <div className="table-wrap">
              <table className="table stack-sm">
                <thead>
                  <tr>
                    <th scope="col">Qué</th>
                    <th scope="col" className="num">
                      Máximo
                    </th>
                    <th scope="col">Ventana</th>
                    <th scope="col">Alcance</th>
                  </tr>
                </thead>
                <tbody>
                  {RATE_ROWS.map((r) => (
                    <tr key={r.name}>
                      <th scope="row">{r.name}</th>
                      <td className="num" data-label="Máximo">
                        {r.rule.max}
                      </td>
                      <td data-label="Ventana">{windowText(r.rule.window)}</td>
                      <td data-label="Alcance" className="muted-cell">
                        {r.scope}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
