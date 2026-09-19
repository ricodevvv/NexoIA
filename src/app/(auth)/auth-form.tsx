"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import styles from "./auth.module.css";

type Props = {
  mode: "login" | "signup";
  providers: ("google" | "github")[];
};

const PROVIDER_LABEL = { google: "Google", github: "GitHub" };

export function AuthForm({ mode, providers }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email"));
    const password = String(data.get("password"));
    setBusy(true);
    setError(null);
    const result =
      mode === "signup"
        ? await authClient.signUp.email({ email, password, name: String(data.get("name")) })
        : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "No se pudo continuar");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function social(provider: "google" | "github") {
    await authClient.signIn.social({ provider, callbackURL: "/" });
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
          {isSignup && <small className="hint">Mínimo 8 caracteres.</small>}
        </label>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button className={`btn btn-primary ${styles.submit}`} disabled={busy} aria-busy={busy}>
          {busy ? "Un momento…" : isSignup ? "Crear cuenta" : "Entrar"}
        </button>
      </form>

      <p className={styles.switch}>
        {isSignup ? "¿Ya tienes cuenta? " : "¿Primera vez aquí? "}
        <Link href={isSignup ? "/login" : "/signup"}>{isSignup ? "Inicia sesión" : "Crea una cuenta"}</Link>
      </p>
    </div>
  );
}
