"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, KeyRound, Plus, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PlatformKeyView } from "@/lib/platform/keys";
import { CopyButton } from "../ui/copy-button";
import { PageHeader } from "../ui/page-header";
import { formatCompact, formatDate, formatNumber, timeAgo } from "../ui/format";
import { useToast } from "../ui/toast";
import { CodeTabs } from "./code-tabs";

const EXPIRATIONS = [
  { value: "", label: "Nunca" },
  { value: "7", label: "En 7 días" },
  { value: "30", label: "En 30 días" },
  { value: "90", label: "En 90 días" },
  { value: "365", label: "En un año" },
];

function keyState(k: PlatformKeyView) {
  if (k.revokedAt) return { label: "Revocada", className: "tag" };
  if (k.expiresAt && new Date(k.expiresAt) < new Date()) return { label: "Expirada", className: "tag tag-warning" };
  return { label: "Activa", className: "tag tag-success" };
}

/**
 * Administración de las keys de la API de Nexo: crear (se ve una sola vez),
 * revisar su uso y revocarlas.
 */
export function KeysView({ keys, baseUrl, sampleModel }: { keys: PlatformKeyView[]; baseUrl: string; sampleModel: string }) {
  const router = useRouter();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<PlatformKeyView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = keys.filter((k) => !k.revokedAt);
  const revoked = keys.filter((k) => k.revokedAt);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const expires = String(data.get("expires"));
    const res = await fetch("/api/platform/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: String(data.get("name")).trim(), expiresInDays: expires ? Number(expires) : null }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "No se pudo crear la key");
      return;
    }
    setCreating(false);
    setCreated(body.key);
    router.refresh();
  }

  async function revoke(k: PlatformKeyView) {
    const res = await fetch(`/api/platform/keys/${k.id}`, { method: "DELETE" });
    setRevoking(null);
    if (res.ok) {
      toast(`Revocaste “${k.name}”. Las apps que la usaban dejarán de funcionar.`);
      router.refresh();
    } else {
      toast("No se pudo revocar la key", "error");
    }
  }

  return (
    <div className="page">
      <div className="page-inner">
        <PageHeader
          eyebrow="Plataforma"
          title="API keys"
          description="Con una key llamas a cualquier modelo de tu cuenta desde tu código. Trátalas como contraseñas: no las subas a git ni las pongas en el navegador."
          actions={
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              <Plus size={15} aria-hidden="true" /> Crear API key
            </button>
          }
        />

        <section className="card" aria-label="Keys activas">
          {active.length ? (
            <div className="table-wrap">
              <table className="table stack-sm">
                <thead>
                  <tr>
                    <th scope="col">Nombre</th>
                    <th scope="col">Key</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Último uso</th>
                    <th scope="col" className="num">
                      Peticiones (30 d)
                    </th>
                    <th scope="col" className="num">
                      Tokens (30 d)
                    </th>
                    <th scope="col">Expira</th>
                    <th scope="col">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((k) => {
                    const state = keyState(k);
                    return (
                      <tr key={k.id}>
                        <th scope="row">
                          <span className="cell-title">{k.name}</span>
                          <span className="cell-sub">Creada el {formatDate(k.createdAt)}</span>
                        </th>
                        <td data-label="Key">
                          <code className="code-inline">{k.prefix}</code>
                        </td>
                        <td data-label="Estado">
                          <span className={state.className}>{state.label}</span>
                        </td>
                        <td data-label="Último uso" className="muted-cell">
                          {timeAgo(k.lastUsedAt)}
                        </td>
                        <td data-label="Peticiones (30 d)" className="num">
                          {formatNumber(k.requests)}
                        </td>
                        <td data-label="Tokens (30 d)" className="num">
                          {formatCompact(k.tokens)}
                        </td>
                        <td data-label="Expira" className="muted-cell">
                          {k.expiresAt ? formatDate(k.expiresAt) : "Nunca"}
                        </td>
                        <td>
                          <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={() => setRevoking(k)}>
                            Revocar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <KeyRound aria-hidden="true" />
              <h3>Todavía no tienes API keys</h3>
              <p>Crea una para usar los modelos de Nexo desde tus scripts, apps o herramientas como Cursor o LangChain.</p>
              <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                <Plus size={15} aria-hidden="true" /> Crear la primera
              </button>
            </div>
          )}
        </section>

        <div className="grid-2" style={{ marginTop: 16 }}>
          <section className="card" aria-labelledby="como-usar">
            <div className="card-head">
              <h2 id="como-usar" className="card-title">
                Cómo usarla
              </h2>
              <p className="card-desc">
                URL base: <code className="code-inline">{baseUrl}</code>
              </p>
            </div>
            <div className="card-body">
              <CodeTabs initial="python" input={{ baseUrl, model: sampleModel, messages: [{ role: "user", content: "Resume este texto en tres viñetas: …" }] }} />
            </div>
          </section>
          <section className="card" aria-labelledby="buenas-practicas">
            <div className="card-head">
              <h2 id="buenas-practicas" className="card-title">
                Buenas prácticas
              </h2>
            </div>
            <div className="card-body">
              <ul className="check-list">
                <li>
                  <ShieldCheck aria-hidden="true" /> Una key por app o entorno, así puedes revocar una sin tumbar las demás.
                </li>
                <li>
                  <ShieldCheck aria-hidden="true" /> Ponles fecha de expiración a las keys de pruebas.
                </li>
                <li>
                  <ShieldCheck aria-hidden="true" /> Guárdalas en variables de entorno o en un gestor de secretos, nunca en el código.
                </li>
                <li>
                  <ShieldCheck aria-hidden="true" /> Si una se filtra, revócala aquí: deja de funcionar al instante.
                </li>
                <li>
                  <ShieldCheck aria-hidden="true" /> Cada key tiene un límite de 60 peticiones por minuto y usa el plan de tu cuenta.
                </li>
              </ul>
            </div>
          </section>
        </div>

        {revoked.length > 0 && (
          <details className="card disclosure" style={{ marginTop: 16 }}>
            <summary>Keys revocadas · {revoked.length}</summary>
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {revoked.map((k) => (
                    <tr key={k.id}>
                      <th scope="row">{k.name}</th>
                      <td>
                        <code className="code-inline">{k.prefix}</code>
                      </td>
                      <td className="muted-cell">Revocada el {formatDate(k.revokedAt!)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>

      <Dialog.Root open={creating} onOpenChange={setCreating}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>Crear API key</Dialog.Title>
            <Dialog.Description className="muted">Ponle un nombre que te diga dónde la vas a usar.</Dialog.Description>
            <form className="stack" style={{ marginTop: 16 }} onSubmit={create}>
              <label className="field">
                <span>Nombre</span>
                <input className="input" name="name" required maxLength={60} placeholder="Backend de producción" autoFocus />
              </label>
              <label className="field">
                <span>Expira</span>
                <select className="select" name="expires" defaultValue="">
                  {EXPIRATIONS.map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </label>
              {error && <p className="error-text">{error}</p>}
              <div className="dialog-actions">
                <Dialog.Close type="button" className="btn">
                  Cancelar
                </Dialog.Close>
                <button className="btn btn-primary" disabled={busy} aria-busy={busy}>
                  Crear key
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={Boolean(created)} onOpenChange={(o) => !o && setCreated(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog dialog-wide" onInteractOutside={(e) => e.preventDefault()}>
            <Dialog.Title>Tu nueva API key</Dialog.Title>
            <Dialog.Description className="callout" data-tone="warning" style={{ marginTop: 12 }}>
              <AlertTriangle aria-hidden="true" />
              <span>Cópiala ahora y guárdala en un lugar seguro. Por seguridad no la vas a poder ver otra vez.</span>
            </Dialog.Description>
            <div className="secret-box">
              <code>{created}</code>
              <CopyButton text={created ?? ""} className="btn btn-sm btn-primary" />
            </div>
            <div className="dialog-actions">
              <Dialog.Close className="btn">Ya la guardé</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={Boolean(revoking)} onOpenChange={(o) => !o && setRevoking(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>¿Revocar “{revoking?.name}”?</Dialog.Title>
            <Dialog.Description className="muted">Cualquier app que la use va a recibir un 401 desde ya. No se puede deshacer.</Dialog.Description>
            <div className="dialog-actions">
              <Dialog.Close className="btn">Cancelar</Dialog.Close>
              <button type="button" className="btn btn-danger" onClick={() => revoking && revoke(revoking)}>
                Revocar key
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
