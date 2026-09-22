"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, FileText, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ArtifactVersion } from "../artifacts/artifacts";
import { notifyConversationsChanged } from "../events";
import styles from "./chat.module.css";

/**
 * Título del chat con su menú: renombrar y eliminar.
 */
export function TitleMenu({ conversationId, title, onRenamed }: { conversationId: string; title: string; onRenamed: (title: string) => void }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);

  async function rename(value: string) {
    const res = await fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: value }),
    });
    if (res.ok) {
      onRenamed(value);
      notifyConversationsChanged();
    }
    setDialog(null);
  }

  async function remove() {
    await fetch(`/api/conversations/${conversationId}`, { method: "DELETE" });
    setDialog(null);
    notifyConversationsChanged();
    router.push("/");
  }

  return (
    <>
      <Menu.Root>
        <Menu.Trigger className={styles.titleBtn} aria-label={`Opciones del chat ${title}`}>
          <span className={styles.titleText}>{title}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content className="menu" align="start" sideOffset={6}>
            <Menu.Item className="menu-item" onSelect={() => setDialog("rename")}>
              <Pencil /> Renombrar
            </Menu.Item>
            <Menu.Separator className="menu-sep" />
            <Menu.Item className="menu-item" data-danger onSelect={() => setDialog("delete")}>
              <Trash2 /> Eliminar
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>

      <Dialog.Root open={dialog === "rename"} onOpenChange={(o) => !o && setDialog(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog" aria-describedby={undefined}>
            <Dialog.Title>Renombrar chat</Dialog.Title>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const value = String(new FormData(e.currentTarget).get("title")).trim();
                if (value) rename(value);
              }}
            >
              <label className="field">
                <span className="sr-only">Título</span>
                <input className="input" name="title" defaultValue={title} maxLength={120} autoFocus />
              </label>
              <div className="dialog-actions">
                <Dialog.Close type="button" className="btn">
                  Cancelar
                </Dialog.Close>
                <button className="btn btn-primary">Guardar</button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={dialog === "delete"} onOpenChange={(o) => !o && setDialog(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>¿Eliminar este chat?</Dialog.Title>
            <Dialog.Description className="muted">“{title}” se borrará para siempre, junto con sus mensajes.</Dialog.Description>
            <div className="dialog-actions">
              <Dialog.Close className="btn">Cancelar</Dialog.Close>
              <button className="btn btn-danger" onClick={remove}>
                Eliminar
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

/**
 * Icono de documento que abre los artifacts del chat. Con uno solo lo abre
 * directo; con varios muestra la lista.
 */
export function ArtifactsButton({ items, onOpen }: { items: ArtifactVersion[]; onOpen: (identifier: string) => void }) {
  if (!items.length) return null;
  const content = (
    <>
      <FileText size={17} aria-hidden="true" />
      <span>{items.length}</span>
    </>
  );
  if (items.length === 1) {
    return (
      <button className={styles.countBtn} aria-label="Ver artifact" title={items[0].title} onClick={() => onOpen(items[0].identifier)}>
        {content}
      </button>
    );
  }
  return (
    <Menu.Root>
      <Menu.Trigger className={styles.countBtn} aria-label="Artifacts del chat">
        {content}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="menu" align="end" sideOffset={6}>
          <p className="menu-label label">Artifacts</p>
          {items.map((a) => (
            <Menu.Item key={a.identifier} className="menu-item" onSelect={() => onOpen(a.identifier)}>
              <FileText /> {a.title}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
