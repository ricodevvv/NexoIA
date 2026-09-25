"use client";

import { Building2, Check, ExternalLink, FolderGit2, Loader2, Plus, Unplug, User } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Section } from "./settings";
import styles from "./settings.module.css";

type Installation = { id: number; account: string; type: "User" | "Organization"; selection: "all" | "selected"; settingsUrl: string };
type Status = { enabled: boolean; connection: { login: string } | null; installations: Installation[]; expired?: boolean };

async function fetchStatus(): Promise<{ status: Status | null; error: string | null }> {
  const res = await fetch("/api/github");
  const data = await res.json().catch(() => ({}));
  return res.ok ? { status: data, error: null } : { status: null, error: data.error ?? "No se pudo leer el estado de GitHub" };
}

/**
 * Pestaña de GitHub: conectar la cuenta, instalar la app en cuentas u
 * organizaciones y ver a qué tiene acceso el agente de código.
 */
export function GitHub() {
  const params = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchStatus().then((r) => {
      setError(r.error);
      setStatus(r.status);
    });
  }, []);

  useEffect(load, [load]);

  async function disconnect() {
    setBusy(true);
    await fetch("/api/github", { method: "DELETE" });
    setBusy(false);
    load();
  }

  const result = params.get("github");

  return (
    <>
      {result === "ok" && (
        <p className={styles.banner} role="status">
          <Check size={15} aria-hidden="true" /> Listo, conectaste la cuenta {params.get("login") ?? ""} de GitHub.
        </p>
      )}
      {result === "installed" && (
        <p className={styles.banner} role="status">
          <Check size={15} aria-hidden="true" /> GitHub guardó los cambios de la instalación.
        </p>
      )}
      {result === "error" && (
        <p className={styles.warning} role="alert">
          No se pudo conectar GitHub: {params.get("reason") ?? "algo falló"}.
        </p>
      )}
      {status?.expired && (
        <p className={styles.warning} role="alert">
          La conexión con GitHub venció o la revocaron. Vuelve a conectarla.
        </p>
      )}

      <Section
        title="GitHub"
        description="Conecta tu cuenta y elige en qué cuentas y organizaciones instalar la app. El agente de código podrá clonar esos repos, hacer commits, subir ramas y abrir pull requests a tu nombre."
      >
        {!status && !error && (
          <p className="hint">
            <Loader2 size={13} className={styles.spin} aria-hidden="true" /> Cargando…
          </p>
        )}
        {error && <p className="error-text">{error}</p>}
        {status && !status.enabled && <p className="hint">La integración con GitHub todavía no está configurada en este servidor.</p>}

        {status?.enabled && !status.connection && (
          <div className={styles.empty}>
            <FolderGit2 size={20} aria-hidden="true" />
            <p>Todavía no conectas GitHub.</p>
            <a className="btn btn-accent btn-sm" href="/api/github/connect">
              Conectar GitHub
            </a>
          </div>
        )}

        {status?.enabled && status.connection && (
          <>
            <div className={styles.rowHead}>
              <p>
                Conectado como <strong>{status.connection.login}</strong>
              </p>
              <button className="btn btn-sm btn-ghost btn-danger" onClick={disconnect} disabled={busy} aria-busy={busy}>
                <Unplug size={12} /> Desconectar
              </button>
            </div>

            {status.installations.length === 0 ? (
              <div className={styles.empty}>
                <FolderGit2 size={20} aria-hidden="true" />
                <p>La app no está instalada en ninguna cuenta a la que tengas acceso. Instálala para elegir los repos.</p>
              </div>
            ) : (
              <ul className={styles.rows}>
                {status.installations.map((i) => (
                  <li key={i.id} className={styles.row}>
                    <div className={styles.rowHead}>
                      <strong className={styles.connectorName}>
                        {i.type === "Organization" ? <Building2 size={14} aria-hidden="true" /> : <User size={14} aria-hidden="true" />}
                        {i.account}
                        <span className="tag">{i.selection === "all" ? "Todos los repos" : "Repos elegidos"}</span>
                      </strong>
                      <a className="btn btn-sm" href={i.settingsUrl} target="_blank" rel="noreferrer">
                        <ExternalLink size={12} /> Elegir repos
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className={styles.rowActions}>
              <a className="btn btn-sm" href="/api/github/connect?to=install">
                <Plus size={12} /> Agregar cuenta u organización
              </a>
            </div>
            <p className="hint">
              En una organización, instalar la app puede requerir que un administrador la apruebe. Los cambios de repos aplican al momento, sin reiniciar el
              espacio.
            </p>
          </>
        )}
      </Section>
    </>
  );
}
