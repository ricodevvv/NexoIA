"use client";

import { Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { notifyConversationsChanged } from "../events";
import styles from "./invite.module.css";

type Props = {
  state: "ok" | "missing" | "used" | "expired" | "wrong-account";
  invitation: { id: string; email: string; team: string; inviter: string; role: string } | null;
  currentEmail: string;
};

const MESSAGES = {
  missing: ["Esta invitación no existe.", "Revisa que el enlace esté completo."],
  used: ["Esta invitación ya se usó.", "Fue aceptada, rechazada o cancelada."],
  expired: ["Esta invitación venció.", "Pide a quien te invitó que te mande otra."],
};

/**
 * Tarjeta para aceptar o rechazar la invitación a un equipo.
 */
export function InviteCard({ state, invitation, currentEmail }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function respond(accept: boolean) {
    if (!invitation) return;
    setBusy(true);
    setError(null);
    const { error: err } = accept
      ? await authClient.organization.acceptInvitation({ invitationId: invitation.id })
      : await authClient.organization.rejectInvitation({ invitationId: invitation.id });
    if (err) {
      setBusy(false);
      setError(err.message ?? "No se pudo completar");
      return;
    }
    notifyConversationsChanged();
    router.push(accept ? "/workspace" : "/");
    router.refresh();
  }

  if (state !== "ok" && state !== "wrong-account") {
    const [title, body] = MESSAGES[state];
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p className="label">Invitación</p>
          <h1>{title}</h1>
          <p className="muted">{body}</p>
          <Link href="/" className="btn">
            Ir a Nexo
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <span className={styles.icon} aria-hidden="true">
          <Users size={22} />
        </span>
        <p className="label">Invitación a un equipo</p>
        <h1>{invitation!.team}</h1>
        <p className="muted">
          {invitation!.inviter} te invitó a unirte como {invitation!.role === "admin" ? "admin" : "miembro"}. Vas a compartir proyectos y
          conectores con el equipo; tus chats siguen siendo privados.
        </p>
        {state === "wrong-account" ? (
          <p className={styles.warning}>
            Esta invitación es para <strong>{invitation!.email}</strong> y entraste como <strong>{currentEmail}</strong>. Cierra sesión y entra
            con esa cuenta para aceptarla.
          </p>
        ) : (
          <div className={styles.actions}>
            <button className="btn" onClick={() => respond(false)} disabled={busy}>
              Rechazar
            </button>
            <button className="btn btn-primary" onClick={() => respond(true)} disabled={busy} aria-busy={busy}>
              Unirme al equipo
            </button>
          </div>
        )}
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
