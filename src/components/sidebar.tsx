"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal, Pencil, Search, SquarePen, Star, Trash2, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CodeSessions, useCodeNav } from "./code/code-nav";
import { notifyConversationsChanged, onConversationsChanged } from "./events";
import styles from "./sidebar.module.css";
import { useShell } from "./shell";
import { WorkspaceSwitcher, type WorkspaceOption } from "./workspace-switcher";

type Conversation = { id: string; title: string; starred: boolean; updatedAt: string };

type Props = {
  onClose: () => void;
  workspaces: WorkspaceOption[];
  activeWorkspace: string | null;
};

/**
 * Panel de historial junto al riel: chats fijados y recientes, o las sesiones
 * de Nexo Code cuando estás en esa sección. En el celular es el cajón.
 */
export function Sidebar({ onClose, workspaces, activeWorkspace }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const activeId = pathname.startsWith("/chat/") ? pathname.split("/")[2] : null;
  const [items, setItems] = useState<Conversation[]>([]);
  const { openSearch } = useShell();
  const codeNav = useCodeNav();
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  const [deleting, setDeleting] = useState<Conversation | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/conversations", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: Conversation[] | null) => {
          if (alive && data) setItems(data);
        });
    load();
    const off = onConversationsChanged(load);
    return () => {
      alive = false;
      off();
    };
  }, []);

  const pinned = items.filter((c) => c.starred);
  const recents = items.filter((c) => !c.starred);

  async function patch(id: string, data: Partial<Pick<Conversation, "title" | "starred">>) {
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    notifyConversationsChanged();
  }

  async function remove(id: string) {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    setDeleting(null);
    notifyConversationsChanged();
    if (activeId === id) router.push("/");
  }

  const renderItem = (c: Conversation) => (
    <li key={c.id} className={styles.item} data-active={activeId === c.id}>
      <Link href={`/chat/${c.id}`} className={styles.itemLink} title={c.title} aria-current={activeId === c.id ? "page" : undefined}>
        <span className={styles.itemTitle}>{c.title}</span>
      </Link>
      <Menu.Root>
        <Menu.Trigger className={styles.itemMenu} aria-label={`Opciones de ${c.title}`}>
          <MoreHorizontal size={16} />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content className="menu" align="start" sideOffset={4}>
            <Menu.Item className="menu-item" onSelect={() => patch(c.id, { starred: !c.starred })}>
              <Star /> {c.starred ? "Desfijar" : "Fijar"}
            </Menu.Item>
            <Menu.Item className="menu-item" onSelect={() => setRenaming(c)}>
              <Pencil /> Renombrar
            </Menu.Item>
            <Menu.Separator className="menu-sep" />
            <Menu.Item className="menu-item" data-danger onSelect={() => setDeleting(c)}>
              <Trash2 /> Eliminar
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
    </li>
  );

  const codeMode = Boolean(codeNav) && pathname.startsWith("/code");
  const closeOnMobile = () => window.matchMedia("(max-width: 860px)").matches && onClose();

  return (
    <nav id="panel-historial" className={styles.panel} aria-label={codeMode ? "Sesiones de código" : "Conversaciones"}>
      <div className={styles.head}>
        <h2 className={styles.heading}>{codeMode ? "Nexo Code" : "Chats"}</h2>
        {!codeMode && (
          <Link href="/" className={`icon-btn ${styles.headAction}`} aria-label="Nuevo chat" title="Nuevo chat" onClick={closeOnMobile}>
            <SquarePen />
          </Link>
        )}
        <button className={`icon-btn ${styles.close}`} onClick={onClose} aria-label="Cerrar historial">
          <X />
        </button>
      </div>

      {codeMode && codeNav ? (
        <CodeSessions nav={codeNav} onPicked={closeOnMobile} />
      ) : (
        <>
          <button type="button" className={styles.search} onClick={openSearch}>
            <Search size={16} aria-hidden="true" />
            <span>Buscar chats</span>
            <kbd className={styles.kbd}>Ctrl K</kbd>
          </button>

          <div className={styles.switcherSlot}>
            <WorkspaceSwitcher workspaces={workspaces} active={activeWorkspace} />
          </div>

          <div className={styles.list}>
            {pinned.length > 0 && (
              <section className={styles.group} aria-labelledby="grupo-fijados">
                <h3 id="grupo-fijados" className={styles.groupTitle}>
                  Fijados
                </h3>
                <ul>{pinned.map(renderItem)}</ul>
              </section>
            )}
            <section className={styles.group} aria-labelledby="grupo-recientes">
              <h3 id="grupo-recientes" className={styles.groupTitle}>
                Recientes
              </h3>
              {recents.length === 0 ? (
                <p className={styles.empty}>Aún no hay chats. Escribe algo y aparecerá aquí.</p>
              ) : (
                <ul>{recents.map(renderItem)}</ul>
              )}
            </section>
          </div>
        </>
      )}

      <RenameDialog
        conversation={renaming}
        onClose={() => setRenaming(null)}
        onSave={(title) => renaming && patch(renaming.id, { title }).then(() => setRenaming(null))}
      />

      <Dialog.Root open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>¿Eliminar este chat?</Dialog.Title>
            <Dialog.Description className="muted">
              “{deleting?.title}” se borrará para siempre, junto con sus mensajes.
            </Dialog.Description>
            <div className="dialog-actions">
              <Dialog.Close className="btn">Cancelar</Dialog.Close>
              <button className="btn btn-danger" onClick={() => deleting && remove(deleting.id)}>
                Eliminar
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </nav>
  );
}

function RenameDialog({
  conversation,
  onClose,
  onSave,
}: {
  conversation: Conversation | null;
  onClose: () => void;
  onSave: (title: string) => void;
}) {
  return (
    <Dialog.Root open={Boolean(conversation)} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog">
          <Dialog.Title>Renombrar chat</Dialog.Title>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const title = String(new FormData(e.currentTarget).get("title")).trim();
              if (title) onSave(title);
            }}
          >
            <label className="field">
              <span className="sr-only">Título</span>
              <input className="input" name="title" defaultValue={conversation?.title} maxLength={120} autoFocus />
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
  );
}
