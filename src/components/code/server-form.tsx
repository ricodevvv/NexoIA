"use client";

import { useState } from "react";
import styles from "./code.module.css";

/**
 * Formulario para conectar un servidor de nexocode (`nexocode serve`).
 */
export function ServerForm({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/code/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        url: form.get("url"),
        password: form.get("password") || undefined,
        directory: form.get("directory") || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo guardar");
      return;
    }
    onCreated(data.id);
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
        <input className="input" name="name" required maxLength={60} placeholder="Mi laptop" />
      </label>
      <label className="field">
        <span>URL del servidor</span>
        <input className="input" name="url" required type="url" placeholder="https://mi-tunel.trycloudflare.com" />
      </label>
      <label className="field">
        <span>Contraseña</span>
        <input className="input" name="password" type="password" autoComplete="off" placeholder="La de NEXOCODE_SERVER_PASSWORD" />
      </label>
      <label className="field">
        <span>Carpeta del proyecto (opcional)</span>
        <input className="input" name="directory" placeholder="/home/tu-usuario/proyectos/mi-app" />
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Conectando…" : "Conectar servidor"}
        </button>
      </div>
    </form>
  );
}
