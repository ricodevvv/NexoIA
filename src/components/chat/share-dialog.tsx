"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Check, Copy, Link2, Share } from "lucide-react";
import { useState } from "react";
import styles from "./chat.module.css";

type ShareState = { id: string; createdAt: string } | null;

/**
 * Botón y diálogo para crear, actualizar o quitar el enlace público de un chat.
 */
export function ShareDialog({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState<ShareState>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = share ? `${window.location.origin}/share/${share.id}` : "";

  async function load() {
    const res = await fetch(`/api/conversations/${conversationId}/share`);
    if (res.ok) setShare(await res.json());
  }

  async function create() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/conversations/${conversationId}/share`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo compartir");
      return;
    }
    setShare({ id: data.id, createdAt: new Date().toISOString() });
  }

  async function remove() {
    setBusy(true);
    await fetch(`/api/conversations/${conversationId}/share`, { method: "DELETE" });
    setBusy(false);
    setShare(null);
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) load();
      }}
    >
      <Dialog.Trigger className="btn btn-ghost btn-sm">
        <Share size={13} /> Compartir
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog">
          <Dialog.Title>Compartir chat</Dialog.Title>
          <Dialog.Description className="muted">
            Cualquiera con el enlace puede ver una copia del chat tal como está ahora. Tus mensajes nuevos no aparecen
            hasta que actualices el enlace.
          </Dialog.Description>
          {share ? (
            <div className={styles.shareBox}>
              <Link2 size={14} aria-hidden="true" />
              <input className={styles.shareUrl} value={url} readOnly onFocus={(e) => e.currentTarget.select()} aria-label="Enlace público" />
              <button className="btn btn-sm" onClick={copy}>
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          ) : null}
          {error && <p className="error-text">{error}</p>}
          <div className="dialog-actions">
            {share && (
              <button className="btn btn-danger" onClick={remove} disabled={busy}>
                Dejar de compartir
              </button>
            )}
            <button className="btn btn-primary" onClick={create} disabled={busy} aria-busy={busy}>
              {share ? "Actualizar enlace" : "Crear enlace"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
