"use client";

import { Activity, KeyRound, Loader2, LogIn, Plug, Shield, Users } from "lucide-react";
import { useState } from "react";
import type { AuditRow } from "@/lib/audit";
import { auditCategory, auditLabel, type AuditCategory } from "@/lib/audit-labels";
import { formatDateTime } from "../ui/format";
import { Segmented } from "../ui/segmented";

const CATEGORY: Record<AuditCategory, { label: string; Icon: typeof Activity }> = {
  auth: { label: "Cuenta", Icon: LogIn },
  keys: { label: "Keys", Icon: KeyRound },
  data: { label: "Datos", Icon: Shield },
  team: { label: "Equipo", Icon: Users },
  connectors: { label: "Conectores", Icon: Plug },
};

function device(ua: string | null) {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : null;
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : null;
  if (!browser && !os) return ua.slice(0, 40);
  return [browser, os].filter(Boolean).join(" en ");
}

function detail(row: AuditRow) {
  const parts: string[] = [];
  if (row.target) parts.push(row.target);
  if (typeof row.metadata.prefix === "string") parts.push(row.metadata.prefix);
  if (typeof row.metadata.role === "string") parts.push(`rol ${row.metadata.role}`);
  if (typeof row.metadata.count === "number") parts.push(`${row.metadata.count} chats`);
  return parts.join(" · ");
}

/**
 * Bitácora de eventos con filtro por tipo y carga de más hacia atrás. Sirve
 * para la cuenta propia y para el equipo (`showActor`).
 */
export function ActivityLog({ initial, endpoint, showActor = false }: { initial: AuditRow[]; endpoint: string; showActor?: boolean }) {
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<"all" | AuditCategory>("all");
  const [more, setMore] = useState(initial.length === 50);
  const [loading, setLoading] = useState(false);
  const visible = filter === "all" ? rows : rows.filter((r) => auditCategory(r.action) === filter);

  async function loadMore() {
    const last = rows.at(-1);
    if (!last) return;
    setLoading(true);
    const res = await fetch(`${endpoint}?before=${encodeURIComponent(last.createdAt)}`);
    const next: AuditRow[] = res.ok ? await res.json() : [];
    setRows((all) => [...all, ...next]);
    setMore(next.length === 50);
    setLoading(false);
  }

  return (
    <>
      <div className="toolbar">
        <Segmented
          value={filter}
          onChange={setFilter}
          label="Filtrar actividad"
          options={[{ value: "all" as const, label: "Todo" }, ...(Object.keys(CATEGORY) as AuditCategory[]).map((k) => ({ value: k, label: CATEGORY[k].label }))]}
        />
      </div>
      <section className="card" aria-label="Eventos">
        {visible.length ? (
          <div className="table-wrap">
            <table className="table stack-sm">
              <thead>
                <tr>
                  <th scope="col">Evento</th>
                  {showActor && <th scope="col">Quién</th>}
                  <th scope="col">Detalle</th>
                  <th scope="col">Desde</th>
                  <th scope="col">Cuándo</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const { Icon } = CATEGORY[auditCategory(r.action)];
                  return (
                    <tr key={r.id}>
                      <th scope="row">
                        <span className="row" style={{ flexWrap: "nowrap" }}>
                          <Icon size={15} aria-hidden="true" style={{ color: "var(--text-3)", flex: "none" }} />
                          {auditLabel(r.action)}
                        </span>
                      </th>
                      {showActor && (
                        <td data-label="Quién">
                          <span className="cell-title">{r.actor?.name ?? "Alguien que ya no está"}</span>
                          {r.actor && <span className="cell-sub">{r.actor.email}</span>}
                        </td>
                      )}
                      <td data-label="Detalle" className="muted-cell">
                        {detail(r) || "—"}
                      </td>
                      <td data-label="Desde">
                        <span className="cell-title">{r.ip ?? "—"}</span>
                        {device(r.userAgent) && <span className="cell-sub">{device(r.userAgent)}</span>}
                      </td>
                      <td data-label="Cuándo" className="muted-cell">
                        {formatDateTime(r.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <Activity aria-hidden="true" />
            <h3>Sin eventos</h3>
            <p>Aquí verás los cambios importantes en cuanto pasen.</p>
          </div>
        )}
        {more && (
          <div className="card-foot">
            <button type="button" className="btn btn-sm" onClick={loadMore} disabled={loading} aria-busy={loading}>
              {loading && <Loader2 size={13} className="spin" aria-hidden="true" />} Cargar más
            </button>
          </div>
        )}
      </section>
    </>
  );
}
