"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import styles from "./auth.module.css";

/**
 * Pide el correo y manda el enlace para restablecer la contraseña. Siempre
 * responde lo mismo, exista o no la cuenta, para no revelar qué correos están
 * registrados.
 */
export function ForgotForm() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    await authClient.requestPasswordReset({
      email: String(new FormData(e.currentTarget).get("email")),
      redirectTo: "/reset-password",
    });
    setBusy(false);
    setSent(true);
  }

  return (
    <div className={styles.card}>
      <p className="label">Recuperar acceso</p>
      <h1>{sent ? "Revisa tu correo." : "¿Olvidaste tu contraseña?"}</h1>
      <p className="muted">
        {sent
          ? "Si hay una cuenta con ese correo, te llegará un enlace para elegir una contraseña nueva. Revisa también el spam."
          : "Escribe tu correo y te mandamos un enlace para crear una nueva."}
      </p>
      {!sent && (
        <form className={styles.form} onSubmit={onSubmit}>
          <label className="field">
            <span>Email</span>
            <input className="input" name="email" type="email" required autoComplete="email" autoFocus />
          </label>
          <button className={`btn btn-primary ${styles.submit}`} disabled={busy} aria-busy={busy}>
            {busy ? "Enviando…" : "Enviar enlace"}
          </button>
        </form>
      )}
      <p className={styles.switch}>
        <Link href="/login">Volver a iniciar sesión</Link>
      </p>
    </div>
  );
}

/**
 * Formulario para elegir la contraseña nueva con el token que llegó por correo.
 */
export function ResetForm({ token, invalid }: { token: string | null; invalid: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    const data = new FormData(e.currentTarget);
    const password = String(data.get("password"));
    if (password !== String(data.get("confirm"))) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await authClient.resetPassword({ newPassword: password, token });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "El enlace no es válido o ya caducó.");
      return;
    }
    setDone(true);
  }

  if (!token || invalid) {
    return (
      <div className={styles.card}>
        <p className="label">Enlace inválido</p>
        <h1>Este enlace ya no sirve.</h1>
        <p className="muted">Puede que haya caducado o que ya lo hayas usado. Pide uno nuevo.</p>
        <p className={styles.switch}>
          <Link href="/forgot-password">Pedir otro enlace</Link>
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className={styles.card}>
        <p className="label">Listo</p>
        <h1>Contraseña actualizada.</h1>
        <p className="muted">Cerramos tus otras sesiones por seguridad. Ya puedes entrar con la nueva.</p>
        <button className={`btn btn-primary ${styles.submit}`} onClick={() => router.replace("/login")} style={{ marginTop: 24 }}>
          Ir a iniciar sesión
        </button>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <p className="label">Nueva contraseña</p>
      <h1>Elige una nueva.</h1>
      <form className={styles.form} onSubmit={onSubmit}>
        <label className="field">
          <span>Contraseña nueva</span>
          <input className="input" name="password" type="password" required minLength={8} autoComplete="new-password" autoFocus />
          <small className="hint">Mínimo 8 caracteres.</small>
        </label>
        <label className="field">
          <span>Repítela</span>
          <input className="input" name="confirm" type="password" required minLength={8} autoComplete="new-password" />
        </label>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button className={`btn btn-primary ${styles.submit}`} disabled={busy} aria-busy={busy}>
          {busy ? "Guardando…" : "Guardar contraseña"}
        </button>
      </form>
    </div>
  );
}
