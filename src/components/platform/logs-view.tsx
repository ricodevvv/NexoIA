"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ListTree, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { LogRow } from "@/lib/platform/analytics";
import { SOURCE_LABEL } from "@/lib/platform/analytics-labels";
import { PageHeader } from "../ui/page-header";
import { formatCost, formatDateTime, formatLatency, formatNumber } from "../ui/format";
import { SourceTag, StatusTag } from "./tags";

type Filters = { source: string; status: string; model: string };

type Props = {
  initial: LogRow[];
  filters: Filters;
  models: { id: string; label: string }[];
  labels: Record<string, string>;
  keys: Record<string, string>;
};

function query(filters: Filters, extra: Record<string, string> = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filters, ...extra })) if (v) params.set(k, v);
  return params.toString();
}

/**
 * Tabla de peticiones con filtros por origen, modelo y estado, paginada hacia
 * atrás y con el detalle de cada una en un diálogo.
 */
export function LogsView({ initial, filters, models, labels, keys }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState(initial);
  const [seen, setSeen] = useState(initial);
  const [more, setMore] = useState(initial.length === 50);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<LogRow | null>(null);

  if (seen !== initial) {
    setSeen(initial);
    setRows(initial);
    setMore(initial.length === 50);
  }

  function setFilter(key: keyof Filters, value: string) {
    startTransition(() => router.push(`/platform/logs?${query({ ...filters, [key]: value })}`, { scroll: false }));
  }

  async function loadMore() {
    const last = rows.at(-1);
    if (!last) return;
    setLoading(true);
    const res = await fetch(`/api/platform/logs?${query(filters, { before: last.createdAt })}`);
    const next: LogRow[] = res.ok ? await res.json() : [];
    setRows((all) => [...all, ...next]);
    setMore(next.length === 50);
    setLoading(false);
  }

  const label = (id: string) => labels[id] ?? id;

  return (
    <div className="page">
      <div className="page-inner">
        <PageHeader eyebrow="Plataforma" title="Logs" description="Cada petición a un modelo: de dónde vino, cuántos tokens usó, cuánto tardó y si salió bien." />

        <div className="toolbar" role="group" aria-label="Filtros">
          <label className="sr-only" htmlFor="filtro-origen">
            Origen
          </label>
          <select id="filtro-origen" className="select" value={filters.source} onChange={(e) => setFilter("source", e.target.value)}>
            <option value="">Todos los orígenes</option>
            {Object.entries(SOURCE_LABEL).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filtro-modelo">
            Modelo
          </label>
          <select id="filtro-modelo" className="select" value={filters.model} onChange={(e) => setFilter("model", e.target.value)}>
            <option value="">Todos los modelos</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filtro-estado">
            Estado
          </label>
          <select id="filtro-estado" className="select" value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="ok">Correctas</option>
            <option value="error">Con error</option>
          </select>
          {(filters.source || filters.model || filters.status) && (
            <Link href="/platform/logs" className="btn btn-sm btn-ghost">
              <X size={13} aria-hidden="true" /> Quitar filtros
            </Link>
          )}
        </div>

        <section className="card" style={{ opacity: pending ? 0.55 : 1 }} aria-label="Peticiones">
          {rows.length ? (
            <div className="table-wrap" style={{ maxHeight: "calc(100dvh - 300px)", minHeight: 240 }}>
              <table className="table stack-sm">
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Modelo</th>
                    <th scope="col">Origen</th>
                    <th scope="col">Estado</th>
                    <th scope="col" className="num">
                      Entrada
                    </th>
                    <th scope="col" className="num">
                      Salida
                    </th>
                    <th scope="col" className="num">
                      Latencia
                    </th>
                    <th scope="col" className="num">
                      Costo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} data-clickable onClick={() => setOpen(r)}>
                      <th scope="row">
                        <button type="button" className="link-button" onClick={() => setOpen(r)}>
                          {formatDateTime(r.createdAt)}
                        </button>
                      </th>
                      <td data-label="Modelo">{label(r.model)}</td>
                      <td data-label="Origen">
                        <SourceTag source={r.source} />
                      </td>
                      <td data-label="Estado">
                        <StatusTag status={r.status} />
                      </td>
                      <td className="num" data-label="Entrada">
                        {formatNumber(r.inputTokens)}
                      </td>
                      <td className="num" data-label="Salida">
                        {formatNumber(r.outputTokens)}
                      </td>
                      <td className="num" data-label="Latencia">
                        {formatLatency(r.latencyMs)}
                      </td>
                      <td className="num" data-label="Costo">
                        {formatCost(r.cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <ListTree aria-hidden="true" />
              <h3>No hay peticiones con estos filtros</h3>
              <p>Cuando uses el chat, el playground o la API, cada llamada aparece aquí.</p>
            </div>
          )}
          {more && (
            <div className="card-foot">
              <button type="button" className="btn btn-sm" onClick={loadMore} disabled={loading} aria-busy={loading}>
                {loading && <Loader2 size={13} className="spin" aria-hidden="true" />} Cargar más
              </button>
              <span>{rows.length} mostradas</span>
            </div>
          )}
        </section>

        <Dialog.Root open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="dialog dialog-wide" aria-describedby={undefined}>
              <Dialog.Title>Detalle de la petición</Dialog.Title>
              {open && (
                <dl className="detail-list">
                  <div>
                    <dt>ID</dt>
                    <dd>
                      <code className="code-inline">{open.id}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Fecha</dt>
                    <dd>{new Date(open.createdAt).toLocaleString("es")}</dd>
                  </div>
                  <div>
                    <dt>Modelo</dt>
                    <dd>
                      {label(open.model)} <code className="code-inline">{open.model}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Origen</dt>
                    <dd>
                      <SourceTag source={open.source} />
                    </dd>
                  </div>
                  {open.apiKeyId && (
                    <div>
                      <dt>API key</dt>
                      <dd>{keys[open.apiKeyId] ?? "Key borrada"}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Estado</dt>
                    <dd>
                      <StatusTag status={open.status} />
                    </dd>
                  </div>
                  {open.error && (
                    <div>
                      <dt>Error</dt>
                      <dd className="error-text">{open.error}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Tokens</dt>
                    <dd>
                      {formatNumber(open.inputTokens)} de entrada · {formatNumber(open.outputTokens)} de salida
                    </dd>
                  </div>
                  <div>
                    <dt>Latencia</dt>
                    <dd>{formatLatency(open.latencyMs)}</dd>
                  </div>
                  <div>
                    <dt>Costo estimado</dt>
                    <dd>
                      {formatCost(open.cost)}
                      {open.byok && <span className="tag" style={{ marginLeft: 8 }}>Con tu propia key</span>}
                    </dd>
                  </div>
                  {open.conversationId && (
                    <div>
                      <dt>Conversación</dt>
                      <dd>
                        <Link href={`/chat/${open.conversationId}`}>Abrir el chat</Link>
                      </dd>
                    </div>
                  )}
                </dl>
              )}
              <div className="dialog-actions">
                <Dialog.Close className="btn">Cerrar</Dialog.Close>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </div>
  );
}
