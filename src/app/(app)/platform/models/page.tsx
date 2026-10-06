import { Brain, Eye, FileText, Globe } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { listModels } from "@/lib/ai/models";
import { modelOptions } from "@/lib/ai/options";
import { getPlan } from "@/lib/billing/usage";
import { requireUser } from "@/lib/session";
import { CopyButton } from "@/components/ui/copy-button";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Modelos" };

const PROVIDER = { anthropic: "Anthropic", openai: "OpenAI", compat: "Compatible" } as const;

function tokens(n?: number) {
  if (!n) return "—";
  return n >= 1_000_000 ? `${n / 1_000_000}M` : `${Math.round(n / 1000)}k`;
}

function price(n?: number) {
  return n === undefined ? "—" : `$${n.toFixed(n < 1 ? 2 : 2)}`;
}

export default async function ModelsPage() {
  const user = await requireUser();
  const [options, plan] = await Promise.all([modelOptions(user.id), getPlan(user.id)]);
  const catalog = new Map(listModels().map((m) => [m.id, m]));

  return (
    <div className="page">
      <div className="page-inner">
        <PageHeader
          eyebrow="Plataforma"
          title="Modelos"
          description="Todos los modelos que puedes usar en el chat, el playground y la API, con su contexto, capacidades y precio por millón de tokens."
        />
        <section className="card">
          <div className="table-wrap">
            <table className="table stack-sm">
              <thead>
                <tr>
                  <th scope="col">Modelo</th>
                  <th scope="col">ID para la API</th>
                  <th scope="col">Proveedor</th>
                  <th scope="col" className="num">
                    Contexto
                  </th>
                  <th scope="col" className="num">
                    Salida máx.
                  </th>
                  <th scope="col" className="num">
                    Entrada / 1M
                  </th>
                  <th scope="col" className="num">
                    Salida / 1M
                  </th>
                  <th scope="col">Capacidades</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {options.map((m) => {
                  const info = catalog.get(m.id);
                  const locked = m.tier === "pro" && plan !== "pro" && !m.byok;
                  return (
                    <tr key={m.id}>
                      <th scope="row">
                        <span className="cell-title">{m.label}</span>
                        <span className="cell-sub">{m.description}</span>
                      </th>
                      <td data-label="ID">
                        <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                          <code className="code-inline">{m.id}</code>
                          <CopyButton text={m.id} label={`Copiar ${m.id}`} showLabel={false} className="icon-btn" />
                        </span>
                      </td>
                      <td data-label="Proveedor">{m.group ?? PROVIDER[m.provider]}</td>
                      <td data-label="Contexto" className="num">
                        {tokens(info?.context)}
                      </td>
                      <td data-label="Salida máx." className="num">
                        {tokens(info?.maxOutput)}
                      </td>
                      <td data-label="Entrada / 1M" className="num">
                        {price(info?.pricing?.input)}
                      </td>
                      <td data-label="Salida / 1M" className="num">
                        {price(info?.pricing?.output)}
                      </td>
                      <td data-label="Capacidades">
                        <span className="caps">
                          {m.vision && (
                            <span className="cap" title="Visión: entiende imágenes">
                              <Eye aria-hidden="true" />
                              <span className="sr-only">Visión</span>
                            </span>
                          )}
                          {m.pdf && (
                            <span className="cap" title="Lee PDF">
                              <FileText aria-hidden="true" />
                              <span className="sr-only">PDF</span>
                            </span>
                          )}
                          {m.reasoning && (
                            <span className="cap" title="Razona antes de responder">
                              <Brain aria-hidden="true" />
                              <span className="sr-only">Razonamiento</span>
                            </span>
                          )}
                          {m.webSearch && (
                            <span className="cap" title="Puede buscar en la web">
                              <Globe aria-hidden="true" />
                              <span className="sr-only">Búsqueda web</span>
                            </span>
                          )}
                        </span>
                      </td>
                      <td data-label="Estado">
                        {!m.available ? (
                          <span className="tag">Sin key</span>
                        ) : locked ? (
                          <span className="tag tag-warning">Plan Pro</span>
                        ) : m.byok ? (
                          <span className="tag tag-accent">Tu key</span>
                        ) : (
                          <span className="tag tag-success">Disponible</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <p className="hint" style={{ marginTop: 12 }}>
          Precios en dólares según la lista pública de cada proveedor; sirven para estimar costos. Para usar un modelo sin key, agrega la tuya en{" "}
          <Link href="/settings?tab=keys">Ajustes → Modelos</Link> o conecta un endpoint compatible con OpenAI.
        </p>
      </div>
    </div>
  );
}
