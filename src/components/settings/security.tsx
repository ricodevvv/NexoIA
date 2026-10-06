"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Laptop, Loader2, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { renderSVG } from "uqr";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { CopyButton } from "../ui/copy-button";
import { timeAgo } from "../ui/format";
import { useToast } from "../ui/toast";
import { Section } from "./settings";
import styles from "./settings.module.css";

type SessionRow = { id: string; token: string; ipAddress?: string | null; userAgent?: string | null; createdAt: Date | string; updatedAt: Date | string };

function describe(ua: string | null | undefined) {
  if (!ua) return { name: "Dispositivo desconocido", mobile: false };
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /curl/.test(ua) ? "curl" : "Navegador";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return { name: os ? `${browser} en ${os}` : browser, mobile: /Android|iPhone|iPad|Mobile/.test(ua) };
}

function secretOf(uri: string) {
  return new URL(uri).searchParams.get("secret") ?? "";
}

function Password() {
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const { error } = await authClient.changePassword({
      currentPassword: String(data.get("current")),
      newPassword: String(data.get("next")),
      revokeOtherSessions: true,
    });
    setMsg(error ? { kind: "error", text: authErrorMessage(error, "No se pudo cambiar") } : { kind: "ok", text: "Contraseña actualizada" });
    if (!error) form.reset();
  }

  return (
    <Section title="Contraseña" description="Al cambiarla se cierran tus otras sesiones.">
      <form className={styles.stack} onSubmit={changePassword}>
        <label className="field">
          <span>Contraseña actual</span>
          <input className="input" name="current" type="password" required autoComplete="current-password" />
        </label>
        <label className="field">
          <span>Nueva contraseña</span>
          <input className="input" name="next" type="password" required minLength={8} autoComplete="new-password" />
        </label>
        <div>
          <button className="btn">Cambiar contraseña</button>
        </div>
        {msg && <p className={msg.kind === "ok" ? styles.ok : "error-text"}>{msg.text}</p>}
      </form>
    </Section>
  );
}

function TwoFactor({ enabled, hasPassword }: { enabled: boolean; hasPassword: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<"idle" | "password" | "scan" | "codes" | "disable">("idle");
  const [setup, setSetup] = useState<{ uri: string; codes: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const password = String(new FormData(e.currentTarget).get("password"));
    const { data, error: err } = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (err || !data || data.method !== "totp") {
      setError(authErrorMessage(err, "La contraseña no es correcta"));
      return;
    }
    setSetup({ uri: data.totpURI, codes: data.backupCodes });
    setStep("scan");
  }

  async function confirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const code = String(new FormData(e.currentTarget).get("code")).replace(/\s+/g, "");
    const { error: err } = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (err) {
      setError("El código no coincide. Prueba con el siguiente que muestre la app.");
      return;
    }
    setStep("codes");
  }

  async function disable(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const password = String(new FormData(e.currentTarget).get("password"));
    const { error: err } = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (err) {
      setError(authErrorMessage(err, "La contraseña no es correcta"));
      return;
    }
    setStep("idle");
    toast("Desactivaste la verificación en dos pasos");
    router.refresh();
  }

  function finish() {
    setStep("idle");
    setSetup(null);
    toast("Verificación en dos pasos activada");
    router.refresh();
  }

  return (
    <Section
      title="Verificación en dos pasos"
      description="Además de la contraseña, te pedimos un código de tu app de autenticación (Google Authenticator, 1Password, Authy…) al entrar."
    >
      <div className="row" style={{ justifyContent: "space-between" }}>
        {enabled ? (
          <span className="tag tag-success">
            <ShieldCheck size={12} aria-hidden="true" /> Activada
          </span>
        ) : (
          <span className="tag">
            <ShieldOff size={12} aria-hidden="true" /> Desactivada
          </span>
        )}
        {hasPassword ? (
          enabled ? (
            <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={() => setStep("disable")}>
              Desactivar
            </button>
          ) : (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setStep("password")}>
              Activar
            </button>
          )
        ) : (
          <span className="hint">Necesitas una contraseña para activarla (entraste con Google o GitHub).</span>
        )}
      </div>

      <Dialog.Root
        open={step !== "idle"}
        onOpenChange={(o) => {
          if (!o && step !== "codes") {
            setStep("idle");
            setError(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog dialog-wide" aria-describedby={undefined} onInteractOutside={(e) => step === "codes" && e.preventDefault()}>
            {step === "password" && (
              <>
                <Dialog.Title>Activar la verificación en dos pasos</Dialog.Title>
                <form className="stack" style={{ marginTop: 12 }} onSubmit={start}>
                  <p className="muted">Primero confirma tu contraseña.</p>
                  <label className="field">
                    <span>Contraseña</span>
                    <input className="input" name="password" type="password" required autoComplete="current-password" autoFocus />
                  </label>
                  {error && <p className="error-text">{error}</p>}
                  <div className="dialog-actions">
                    <Dialog.Close type="button" className="btn">
                      Cancelar
                    </Dialog.Close>
                    <button className="btn btn-primary" disabled={busy} aria-busy={busy}>
                      Continuar
                    </button>
                  </div>
                </form>
              </>
            )}
            {step === "scan" && setup && (
              <>
                <Dialog.Title>Escanea el código</Dialog.Title>
                <form className="stack" style={{ marginTop: 12 }} onSubmit={confirm}>
                  <div className={styles.setup2fa}>
                    <div className={styles.qr} dangerouslySetInnerHTML={{ __html: renderSVG(setup.uri, { border: 1 }) }} role="img" aria-label="Código QR para tu app de autenticación" />
                    <div className="stack" style={{ gap: 10 }}>
                      <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
                        Abre tu app de autenticación, agrega una cuenta y escanea el QR. Si no puedes escanearlo, escribe esta clave:
                      </p>
                      <div className="secret-box" style={{ marginTop: 0 }}>
                        <code>{secretOf(setup.uri)}</code>
                        <CopyButton text={secretOf(setup.uri)} showLabel={false} className="icon-btn" label="Copiar clave" />
                      </div>
                      <label className="field">
                        <span>Código de 6 dígitos</span>
                        <input className="input" name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} autoFocus />
                      </label>
                    </div>
                  </div>
                  {error && <p className="error-text">{error}</p>}
                  <div className="dialog-actions">
                    <Dialog.Close type="button" className="btn">
                      Cancelar
                    </Dialog.Close>
                    <button className="btn btn-primary" disabled={busy} aria-busy={busy}>
                      Verificar
                    </button>
                  </div>
                </form>
              </>
            )}
            {step === "codes" && setup && (
              <>
                <Dialog.Title>Guarda tus códigos de respaldo</Dialog.Title>
                <p className="muted" style={{ margin: "8px 0 14px" }}>
                  Si pierdes el teléfono, cada uno de estos códigos te deja entrar una vez. Guárdalos en tu gestor de contraseñas.
                </p>
                <ul className={styles.codes}>
                  {setup.codes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <div className="dialog-actions">
                  <CopyButton text={setup.codes.join("\n")} label="Copiar códigos" className="btn" />
                  <button type="button" className="btn btn-primary" onClick={finish}>
                    Ya los guardé
                  </button>
                </div>
              </>
            )}
            {step === "disable" && (
              <>
                <Dialog.Title>Desactivar la verificación en dos pasos</Dialog.Title>
                <form className="stack" style={{ marginTop: 12 }} onSubmit={disable}>
                  <p className="muted">Tu cuenta va a quedar protegida solo con la contraseña.</p>
                  <label className="field">
                    <span>Contraseña</span>
                    <input className="input" name="password" type="password" required autoComplete="current-password" autoFocus />
                  </label>
                  {error && <p className="error-text">{error}</p>}
                  <div className="dialog-actions">
                    <Dialog.Close type="button" className="btn">
                      Cancelar
                    </Dialog.Close>
                    <button className="btn btn-danger" disabled={busy} aria-busy={busy}>
                      Desactivar
                    </button>
                  </div>
                </form>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Section>
  );
}

function Sessions() {
  const toast = useToast();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, me] = await Promise.all([authClient.listSessions(), authClient.getSession()]);
    setSessions((list.data as SessionRow[] | null) ?? []);
    setCurrent(me.data?.session.token ?? null);
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([authClient.listSessions(), authClient.getSession()]).then(([list, me]) => {
      if (!alive) return;
      setSessions((list.data as SessionRow[] | null) ?? []);
      setCurrent(me.data?.session.token ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function revoke(token: string) {
    await authClient.revokeSession({ token });
    toast("Sesión cerrada");
    load();
  }

  async function revokeOthers() {
    await authClient.revokeOtherSessions();
    toast("Cerraste las demás sesiones");
    load();
  }

  const sorted = [...(sessions ?? [])].sort((a, b) => (a.token === current ? -1 : b.token === current ? 1 : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));

  return (
    <Section title="Sesiones activas" description="Dispositivos donde tu cuenta está abierta. Cierra las que no reconozcas.">
      {sessions === null ? (
        <p className="muted">
          <Loader2 size={14} className="spin" aria-hidden="true" /> Cargando…
        </p>
      ) : (
        <ul className={styles.sessions}>
          {sorted.map((s) => {
            const d = describe(s.userAgent);
            const mine = s.token === current;
            return (
              <li key={s.id}>
                <span className={styles.sessionIcon}>{d.mobile ? <Smartphone size={17} aria-hidden="true" /> : <Laptop size={17} aria-hidden="true" />}</span>
                <span className={styles.sessionText}>
                  <strong>
                    {d.name} {mine && <span className="tag tag-accent">Esta sesión</span>}
                  </strong>
                  <span>
                    {s.ipAddress ?? "IP desconocida"} · Activa {timeAgo(new Date(s.updatedAt).toISOString()).toLowerCase()}
                  </span>
                </span>
                {!mine && (
                  <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={() => revoke(s.token)}>
                    Cerrar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {sessions && sessions.length > 1 && (
        <div>
          <button type="button" className="btn btn-sm" onClick={revokeOthers}>
            Cerrar todas las demás
          </button>
        </div>
      )}
    </Section>
  );
}

/**
 * Pestaña de seguridad: contraseña, verificación en dos pasos con app de
 * autenticación y las sesiones abiertas en otros dispositivos.
 */
export function Security({ twoFactorEnabled, hasPassword }: { twoFactorEnabled: boolean; hasPassword: boolean }) {
  return (
    <>
      {hasPassword && <Password />}
      <TwoFactor enabled={twoFactorEnabled} hasPassword={hasPassword} />
      <Sessions />
    </>
  );
}
