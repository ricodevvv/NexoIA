"use client";

import { ExternalLink, GitPullRequest, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import chat from "../chat/chat.module.css";
import styles from "./code.module.css";

type PrState = { repo: string | null; url: string | null };

/**
 * Botón "Crear PR" de la cabecera de una sesión con repo de GitHub, como el
 * de Claude Code: sube la rama y abre el pull request. Cuando ya hay uno se
 * vuelve un enlace al PR, y volver a pulsar "Actualizar" sube lo nuevo.
 */
export function PrButton({ serverId, sessionId }: { serverId: string; sessionId: string }) {
  const url = `/api/code/${serverId}/sessions/${encodeURIComponent(sessionId)}/pr`;
  const [state, setState] = useState<PrState & { for: string }>({ repo: null, url: null, for: "" });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(url, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<PrState>) : { repo: null, url: null }))
      .then((data) => alive && setState({ ...data, for: url }));
    return () => {
      alive = false;
    };
  }, [url]);

  if (state.for !== url || !state.repo) return null;

  async function create() {
    setWorking(true);
    setError(null);
    setNotice(null);
    const res = await fetch(url, { method: "POST" }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setWorking(false);
    if (!res?.ok) {
      setError(data?.error ?? "No se pudo crear el PR");
      return;
    }
    setState((s) => ({ ...s, url: data.url }));
    setNotice(data.created ? `Se abrió el PR #${data.number}` : `Se subieron los cambios al PR #${data.number}`);
    if (data.created) window.open(data.url, "_blank", "noopener");
  }

  return (
    <div className={styles.prWrap}>
      {state.url && (
        <a className={chat.countBtn} href={state.url} target="_blank" rel="noopener noreferrer" aria-label="Ver el pull request" title="Ver el PR en GitHub">
          <ExternalLink size={16} aria-hidden="true" />
          <span className={styles.prLabel}>Ver PR</span>
        </a>
      )}
      <button type="button" className={`btn btn-sm ${styles.prBtn}`} onClick={create} disabled={working} title={state.url ? "Subir los cambios nuevos al PR" : `Crear un pull request en ${state.repo}`}>
        {working ? <Loader2 size={15} className={styles.spin} aria-hidden="true" /> : <GitPullRequest size={15} aria-hidden="true" />}
        <span>{working ? "Subiendo…" : state.url ? "Actualizar" : "Crear PR"}</span>
      </button>
      {(error || notice) && (
        <div className={styles.prPop} role={error ? "alert" : "status"} data-level={error ? "error" : "ok"}>
          <span>{error ?? notice}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Cerrar"
            onClick={() => {
              setError(null);
              setNotice(null);
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
