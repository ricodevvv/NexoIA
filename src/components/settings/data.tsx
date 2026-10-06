"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Archive, ArchiveRestore, Download, ExternalLink, Link2, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { notifyConversationsChanged } from "../events";
import { formatDate } from "../ui/format";
import { useToast } from "../ui/toast";
import { Section } from "./settings";
import styles from "./settings.module.css";

type Archived = { id: string; title: string; updatedAt: string };
type Share = { id: string; conversationId: string; title: string; createdAt: string };

function ArchivedChats() {
  const toast = useToast();
  const [items, setItems] = useState<Archived[] | null>(null);
  const [confirm, setConfirm] = useState(false);

  async function load() {
    const res = await fetch("/api/conversations?archived=1", { cache: "no-store" });
    setItems(res.ok ? await res.json() : []);
  }

  useEffect(() => {
    let alive = true;
    fetch("/api/conversations?archived=1", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => alive && setItems(data));
    return () => {
      alive = false;
    };
  }, []);

  async function restore(id: string) {
    await fetch(`/api/conversations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: false }) });
    notifyConversationsChanged();
    toast("Chat restaurado");
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    load();
  }

  async function removeAll() {
    await fetch("/api/conversations", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "archived" }) });
    setConfirm(false);
    toast("Borraste los chats archivados");
    load();
  }

  return (
    <Section title={`Chats archivados${items ? ` · ${items.length}` : ""}`} description="Los chats archivados no aparecen en la barra lateral, pero siguen buscables desde aquí.">
      {items === null ? (
        <p className="muted">
          <Loader2 size={14} className="spin" aria-hidden="true" /> Cargando…
        </p>
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          <Archive size={20} aria-hidden="true" />
          <p>No tienes chats archivados. Archívalos desde el menú de cada chat.</p>
        </div>
      ) : (
        <>
          <ul className={styles.memories}>
            {items.map((c) => (
              <li key={c.id}>
                <Link href={`/chat/${c.id}`}>{c.title}</Link>
                <time className="label" dateTime={c.updatedAt}>
                  {formatDate(c.updatedAt)}
                </time>
                <button className="icon-btn" onClick={() => restore(c.id)} aria-label={`Restaurar ${c.title}`} title="Restaurar">
                  <ArchiveRestore />
                </button>
                <button className="icon-btn" onClick={() => remove(c.id)} aria-label={`Borrar ${c.title}`} title="Borrar">
                  <Trash2 />
                </button>
              </li>
            ))}
          </ul>
          <div>
            <button className="btn btn-sm btn-ghost btn-danger" onClick={() => setConfirm(true)}>
              Borrar todos los archivados
            </button>
          </div>
        </>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="¿Borrar todos los chats archivados?"
        text="Se borran para siempre, con sus mensajes."
        action="Borrar archivados"
        onConfirm={removeAll}
      />
    </Section>
  );
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  text,
  action,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  text: string;
  action: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description className="muted">{text}</Dialog.Description>
          <div className="dialog-actions">
            <Dialog.Close className="btn">Cancelar</Dialog.Close>
            <button className="btn btn-danger" onClick={onConfirm}>
              {action}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Pestaña de datos y privacidad: exportar, chats archivados, enlaces
 * públicos, borrar todos los chats y eliminar la cuenta.
 */
export function DataPrivacy({ shares }: { shares: Share[] }) {
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<"chats" | "account" | null>(null);

  async function unshare(conversationId: string) {
    await fetch(`/api/conversations/${conversationId}/share`, { method: "DELETE" });
    router.refresh();
  }

  async function deleteChats() {
    const res = await fetch("/api/conversations", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "all" }) });
    const body = await res.json().catch(() => ({ deleted: 0 }));
    setDialog(null);
    notifyConversationsChanged();
    toast(`Borraste ${body.deleted} chats`);
    router.refresh();
  }

  async function deleteAccount() {
    await authClient.deleteUser();
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <Section title="Exportar tus datos" description="Descarga tus chats, proyectos, memoria, estilos y ajustes en un archivo JSON. Sin secretos ni keys.">
        <div>
          <a className="btn" href="/api/export" download>
            <Download size={15} aria-hidden="true" /> Exportar mis datos
          </a>
        </div>
      </Section>

      <ArchivedChats />

      <Section title="Enlaces compartidos" description="Chats que tienen un enlace público activo. Cualquiera con el enlace puede verlos.">
        {shares.length === 0 ? (
          <div className={styles.empty}>
            <Link2 size={20} aria-hidden="true" />
            <p>No has compartido ningún chat.</p>
          </div>
        ) : (
          <ul className={styles.memories}>
            {shares.map((x) => (
              <li key={x.id}>
                <Link href={`/chat/${x.conversationId}`}>{x.title}</Link>
                <a className="icon-btn" href={`/share/${x.id}`} target="_blank" rel="noopener noreferrer" aria-label="Abrir enlace público">
                  <ExternalLink />
                </a>
                <button className="btn btn-sm btn-ghost btn-danger" onClick={() => unshare(x.conversationId)}>
                  Dejar de compartir
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Zona de peligro" description="Acciones que no se pueden deshacer.">
        <div className={styles.rows}>
          <div className={styles.row}>
            <div className={styles.rowHead}>
              <span>
                <strong>Borrar todos los chats</strong>
                <span className="hint" style={{ display: "block" }}>
                  Incluye los archivados. Tus proyectos, memoria y ajustes se quedan.
                </span>
              </span>
              <button className="btn btn-sm btn-danger" onClick={() => setDialog("chats")}>
                Borrar chats
              </button>
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles.rowHead}>
              <span>
                <strong>Eliminar mi cuenta</strong>
                <span className="hint" style={{ display: "block" }}>
                  Borra tu cuenta, chats, archivos, keys y conectores. Si tienes suscripción, cancélala antes en Plan.
                </span>
              </span>
              <button className="btn btn-sm btn-danger" onClick={() => setDialog("account")}>
                Eliminar cuenta
              </button>
            </div>
          </div>
        </div>
      </Section>

      <ConfirmDialog
        open={dialog === "chats"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="¿Borrar todos tus chats?"
        text="Se borran para siempre, incluidos los archivados y los compartidos."
        action="Sí, borrar todo"
        onConfirm={deleteChats}
      />
      <ConfirmDialog
        open={dialog === "account"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="¿Eliminar tu cuenta?"
        text="Se borra todo de forma permanente. No hay forma de recuperarla."
        action="Sí, eliminar"
        onConfirm={deleteAccount}
      />
    </>
  );
}
