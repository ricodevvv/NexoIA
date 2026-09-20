"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import styles from "./auth.module.css";
import { authErrorMessage } from "@/lib/auth-errors";

type Props = {
  mode: "login" | "signup";
  providers: ("google" | "github")[];
  next: string;
};


const PROVIDER_LABEL = { google: "Google", github: "GitHub" };

export function AuthForm({ mode, providers, next }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unverified, setUnverified] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email"));
    const password = String(data.get("password"));
    setBusy(true);
    setError(null);
    const result =
      mode === "signup"
        ? await authClient.signUp.email({ email, password, name: String(data.get("name")), callbackURL: next })
        : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (result.error) {
      if (result.error.code === "EMAIL_NOT_VERIFIED") {
        setUnverified(email);
        setError("Confirma tu correo antes de entrar. Te mandamos un enlace al registrarte.");
      } else {
        setError(authErrorMessage(result.error, "No se pudo continuar"));
      }
      return;
    }
    if (mode === "signup" && !("token" in result.data && result.data.token)) {
      setNotice(`Te mandamos un enlace a ${email}. Ábrelo para confirmar tu cuenta y entrar.`);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function resend() {
    if (!unverified) return;
    await authClient.sendVerificationEmail({ email: unverified, callbackURL: next });
    setError(null);
    setNotice(`Listo, revisa ${unverified}.`);
  }

  async function social(provider: "google" | "github") {
    await authClient.signIn.social({ provider, callbackURL: next });
  }

  const isSignup = mode === "signup";

  return (
    <div className={styles.card}>
      <p className="label">{isSignup ? "Crear cuenta" : "Iniciar sesión"}</p>
      <h1>{isSignup ? "Empecemos." : "Qué bueno verte."}</h1>
      <p className="muted">{isSignup ? "Una cuenta y todos los modelos en un lugar." : "Entra para seguir donde lo dejaste."}</p>

      {providers.length > 0 && (
        <>
          <div className={styles.social}>
            {providers.map((p) => (
              <button key={p} type="button" className="btn" onClick={() => social(p)}>
                Continuar con {PROVIDER_LABEL[p]}
              </button>
            ))}
          </div>
          <p className={`${styles.divider} label`}>o con email</p>
        </>
      )}

      <form className={styles.form} onSubmit={onSubmit}>
        {isSignup && (
          <label className="field">
            <span>Nombre</span>
            <input className="input" name="name" required autoComplete="name" maxLength={80} />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input className="input" name="email" type="email" required autoComplete="email" />
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input
            className="input"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={isSignup ? "new-password" : "current-password"}
          />
          {isSignup ? (
            <small className="hint">Mínimo 8 caracteres.</small>
          ) : (
            <Link href="/forgot-password" className={styles.forgot}>
              ¿Olvidaste tu contraseña?
            </Link>
          )}
        </label>
        {error && (
          <p className="error-text" role="alert">
            {error}{" "}
            {unverified && (
              <button type="button" className={styles.linkButton} onClick={resend}>
                Reenviar enlace
              </button>
            )}
          </p>
        )}
        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
        <button className={`btn btn-primary ${styles.submit}`} disabled={busy} aria-busy={busy}>
          {busy ? "Un momento…" : isSignup ? "Crear cuenta" : "Entrar"}
        </button>
      </form>

      <p className={styles.switch}>
        {isSignup ? "¿Ya tienes cuenta? " : "¿Primera vez aquí? "}
        <Link href={`${isSignup ? "/login" : "/signup"}${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}>{isSignup ? "Inicia sesión" : "Crea una cuenta"}</Link>
      </p>
    </div>
  );
}
