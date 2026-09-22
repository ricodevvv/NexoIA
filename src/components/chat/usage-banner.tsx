"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Info, KeyRound, TrendingUp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Quota } from "@/lib/ai/types";
import styles from "./chat.module.css";

export type QuotaState = Quota & { blocked?: string };

const WARN_AT = 0.8;

/**
 * Dice si vale la pena mostrar el aviso: cuando ya bloqueó un mensaje o
 * cuando se usó al menos el 80 % del día.
 */
export function shouldWarn(q: QuotaState | null) {
  return Boolean(q && (q.blocked || q.used / q.limit >= WARN_AT));
}

function resetTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es", { hour: "numeric", minute: "2-digit" });
}

/**
 * Aviso encima del composer con el uso del día y el botón para conseguir más.
 */
export function UsageBanner({ quota, onDismiss }: { quota: QuotaState; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const reached = Boolean(quota.blocked) || quota.used >= quota.limit;
  const pct = Math.min(100, Math.round((quota.used / quota.limit) * 100));

  return (
    <>
      <div className={styles.usage} role="status" data-reached={reached || undefined}>
        {reached ? (
          <span className={styles.usageText}>
            <b>{quota.blocked && quota.used < quota.limit ? quota.blocked : `Límite de uso alcanzado · Se restablece ${resetTime(quota.resetsAt)}`}</b>
            <small>
              {Math.min(quota.used, quota.limit)} de {quota.limit} mensajes hoy · plan {quota.plan === "pro" ? "Pro" : "Free"}
            </small>
          </span>
        ) : (
          <span className={styles.usageText}>
            <Info size={17} aria-hidden="true" />
            Usaste {pct}% de tu límite de hoy
          </span>
        )}
        <button type="button" className={styles.usageBtn} onClick={() => setOpen(true)}>
          Obtener más uso
        </button>
        {!reached && (
          <button type="button" className="icon-btn" onClick={onDismiss} aria-label="Ocultar aviso">
            <X />
          </button>
        )}
      </div>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className={`dialog ${styles.moreDialog}`}>
            <Dialog.Close className={`icon-btn ${styles.moreClose}`} aria-label="Cerrar">
              <X />
            </Dialog.Close>
            <Dialog.Title>¿Necesitas más uso?</Dialog.Title>
            <Dialog.Description className="muted">
              {reached ? "Alcanzaste el límite de tu plan." : `Llevas ${quota.used} de ${quota.limit} mensajes de hoy.`} Para seguir antes de que se
              restablezca:
            </Dialog.Description>
            <div className={styles.moreGrid}>
              <div className={styles.moreCard}>
                <KeyRound size={26} strokeWidth={1.5} aria-hidden="true" />
                <h3>Usa tu propia API key</h3>
                <p>Con tu key de Anthropic, OpenAI o un endpoint compatible no hay límite de mensajes. Pagas directo al proveedor.</p>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setOpen(false);
                    router.push("/settings?tab=keys");
                  }}
                >
                  Agregar API key
                </button>
              </div>
              {quota.plan !== "pro" && (
                <div className={styles.moreCard} data-recommended>
                  <span className={styles.moreBadge}>Recomendado</span>
                  <TrendingUp size={26} strokeWidth={1.5} aria-hidden="true" />
                  <h3>Mejora tu plan</h3>
                  <p>El plan Pro tiene límites mucho más altos y todos los modelos. Ideal para uso diario intenso.</p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setOpen(false);
                      router.push("/settings?tab=billing");
                    }}
                  >
                    Actualizar a Pro
                  </button>
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
