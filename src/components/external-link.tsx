"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState, useSyncExternalStore } from "react";

const TRUSTED_KEY = "nexo-trusted-hosts";
let pending: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function trustedHosts(): string[] {
  try {
    return JSON.parse(localStorage.getItem(TRUSTED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function trust(host: string) {
  try {
    localStorage.setItem(TRUSTED_KEY, JSON.stringify([...new Set([...trustedHosts(), host])]));
  } catch {}
}

/**
 * Abre un enlace externo. Si el dominio no está marcado como de confianza,
 * primero muestra el diálogo de confirmación.
 */
export function openExternal(url: string) {
  const host = hostOf(url);
  if (!host) return;
  if (trustedHosts().includes(host)) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  pending = url;
  emit();
}

/**
 * Enlace que sale de la app pasando por la confirmación de enlace externo.
 */
export function ExternalLink({ href, className, children }: { href?: string; className?: string; children: React.ReactNode }) {
  if (!href || !/^https?:\/\//.test(href)) return <span className={className}>{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        openExternal(href);
      }}
    >
      {children}
    </a>
  );
}

/**
 * Diálogo único de "Abrir enlace externo". Va montado una vez en la app.
 */
export function ExternalLinkDialog() {
  const url = useSyncExternalStore(
    subscribe,
    () => pending,
    () => null,
  );
  const [remember, setRemember] = useState(false);
  const host = url ? hostOf(url) : "";

  function close() {
    pending = null;
    setRemember(false);
    emit();
  }

  return (
    <Dialog.Root open={Boolean(url)} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog">
          <Dialog.Title>Abrir enlace externo</Dialog.Title>
          <Dialog.Description className="muted">Estás saliendo de Nexo para visitar un enlace externo:</Dialog.Description>
          <input className="input" value={url ?? ""} readOnly onFocus={(e) => e.currentTarget.select()} aria-label="Enlace" />
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>
              No volver a preguntar para los enlaces a <code>{host}</code>
            </span>
          </label>
          <div className="dialog-actions">
            <Dialog.Close className="btn">Cancelar</Dialog.Close>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (remember) trust(host);
                if (url) window.open(url, "_blank", "noopener,noreferrer");
                close();
              }}
            >
              Abrir enlace
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
