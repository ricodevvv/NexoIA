"use client";

import { useState } from "react";
import styles from "./code.module.css";

export type NetworkLevel = "none" | "trusted" | "full";
export type EnvironmentData = { id: string; serverId: string; name: string; network: NetworkLevel; domains: string; env: string; setupScript: string };

const LEVELS: { value: NetworkLevel; label: string; hint: string }[] = [
  { value: "none", label: "Ninguno", hint: "Sin internet. Solo GitHub (para clonar y hacer push) y los dominios extra." },
  { value: "trusted", label: "De confianza", hint: "GitHub, GitLab y los registros de paquetes y builds: npm, PyPI, Maven, Gradle, Forge, Fabric, Mojang, crates, Go, Docker Hub, Hugging Face y parecidos." },
  { value: "full", label: "Completo", hint: "Cualquier sitio público. La red interna sigue bloqueada." },
];

/**
 * Formulario para crear o editar un entorno en la nube: el nivel de acceso a
 * internet, dominios extra, variables de entorno y el script que corre al
 * iniciar cada sesión. Sigue el de los entornos de Claude Code en la web.
 */
export function EnvironmentForm(props: {
  initial?: EnvironmentData;
  egress: boolean;
  onSaved: (env: EnvironmentData) => void;
  onDeleted?: () => void;
  onCancel: () => void;
}) {
  const [network, setNetwork] = useState<NetworkLevel>(props.initial?.network ?? "trusted");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = Boolean(props.initial);

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    const res = await fetch(editing ? `/api/code/environments/${props.initial!.id}` : "/api/code/environments", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        network,
        domains: form.get("domains") ?? "",
        env: form.get("env") ?? "",
        setupScript: form.get("setupScript") ?? "",
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo guardar");
      return;
    }
    props.onSaved(data);
  }

  async function remove() {
    if (!props.initial || !window.confirm(`¿Borrar ${props.initial.name}? Se borran también sus sesiones y sus archivos.`)) return;
    setBusy(true);
    const res = await fetch(`/api/code/environments/${props.initial.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "No se pudo borrar");
      return;
    }
    props.onDeleted?.();
  }

  return (
    <form
      className={styles.serverForm}
      onSubmit={(e) => {
        e.preventDefault();
        submit(new FormData(e.currentTarget));
      }}
    >
      <label className="field">
        <span>Nombre</span>
        <input className="input" name="name" required maxLength={60} defaultValue={props.initial?.name ?? ""} placeholder="Mi entorno" />
      </label>

      <fieldset className={styles.networkField}>
        <legend>Acceso a la red</legend>
        {LEVELS.map((l) => (
          <label key={l.value} className={styles.networkOption}>
            <input type="radio" name="network" value={l.value} checked={network === l.value} onChange={() => setNetwork(l.value)} />
            <span>
              {l.label}
              <small>{l.hint}</small>
            </span>
          </label>
        ))}
        {!props.egress && <p className={styles.fieldHint}>Este servidor no tiene proxy de salida configurado, así que por ahora los contenedores salen sin filtro.</p>}
      </fieldset>

      {network !== "full" && (
        <label className="field">
          <span>Dominios extra</span>
          <textarea
            className={`textarea ${styles.mono}`}
            name="domains"
            rows={3}
            defaultValue={props.initial?.domains ?? ""}
            placeholder={"api.example.com\n*.midominio.dev"}
          />
        </label>
      )}

      <label className="field">
        <span>Variables de entorno</span>
        <textarea
          className={`textarea ${styles.mono}`}
          name="env"
          rows={4}
          defaultValue={props.initial?.env ?? ""}
          placeholder={"DATABASE_URL=postgres://…\nNODE_ENV=development"}
          spellCheck={false}
        />
        <small className={styles.fieldHint}>En formato .env, una por línea. Las ve el agente, así que no pongas nada que no quieras que lea.</small>
      </label>

      <label className="field">
        <span>Script de configuración</span>
        <textarea
          className={`textarea ${styles.mono}`}
          name="setupScript"
          rows={5}
          defaultValue={props.initial?.setupScript ?? ""}
          placeholder={"npm install\npip install -r requirements.txt"}
          spellCheck={false}
        />
        <small className={styles.fieldHint}>Corre con bash al iniciar cada sesión, dentro del repo si elegiste uno. Si falla, la sesión no arranca.</small>
      </label>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        {editing && props.onDeleted && (
          <button type="button" className={`btn ${styles.dangerBtn}`} onClick={remove} disabled={busy}>
            Borrar
          </button>
        )}
        <button type="button" className="btn" onClick={props.onCancel}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Guardando…" : editing ? "Guardar" : "Crear entorno"}
        </button>
      </div>
    </form>
  );
}
