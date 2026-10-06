"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import {
  Activity,
  Archive,
  BookOpen,
  Boxes,
  FileText,
  Gauge,
  KeyRound,
  LayoutDashboard,
  ListTree,
  MoreHorizontal,
  Pencil,
  Search,
  ShieldCheck,
  SquarePen,
  Star,
  StarOff,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CodeSessions, useCodeNav } from "./code/code-nav";
import { notifyConversationsChanged, onConversationsChanged } from "./events";
import styles from "./sidebar.module.css";
import { groupByDate } from "./group-by-date";
import { useShell } from "./shell";
import { useToast } from "./ui/toast";
import { WorkspaceSwitcher, type WorkspaceOption } from "./workspace-switcher";

type Conversation = { id: string; title: string; starred: boolean; updatedAt: string };
type Quota = { used: number; limit: number; plan: "free" | "pro"; resetsAt: string };

type Props = {
  onClose: () => void;
  workspaces: WorkspaceOption[];
  activeWorkspace: string | null;
};

export const PLATFORM_NAV = [
  {
    title: "Construir",
    items: [
      { href: "/platform", label: "Resumen", Icon: LayoutDashboard },
      { href: "/platform/playground", label: "Playground", Icon: Terminal },
      { href: "/platform/prompts", label: "Prompts", Icon: FileText },
    ],
  },
  {
    title: "Gestionar",
    items: [
      { href: "/platform/keys", label: "API keys", Icon: KeyRound },
      { href: "/platform/usage", label: "Uso y costos", Icon: Gauge },
      { href: "/platform/logs", label: "Logs", Icon: ListTree },
      { href: "/platform/limits", label: "Límites", Icon: ShieldCheck },
    ],
  },
  {
    title: "Referencia",
    items: [
      { href: "/platform/models", label: "Modelos", Icon: Boxes },
      { href: "/platform/docs", label: "Documentación", Icon: BookOpen },
      { href: "/platform/activity", label: "Actividad", Icon: Activity },
    ],
  },
] as const;

function PlatformNav({ onPicked }: { onPicked: () => void }) {
  const pathname = usePathname();
  return (
    <div className={styles.list}>
      {PLATFORM_NAV.map((group) => (
        <section key={group.title} className={styles.group} aria-label={group.title}>
          <h3 className={styles.groupTitle}>{group.title}</h3>
          <ul>
            {group.items.map(({ href, label, Icon }) => {
              const active = href === "/platform" ? pathname === href : pathname.startsWith(href);
              return (
                <li key={href} className={styles.item} data-active={active}>
                  <Link href={href} className={styles.navLink} aria-current={active ? "page" : undefined} onClick={onPicked}>
                    <Icon size={16} aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function QuotaMeter() {
  const [quota, setQuota] = useState<Quota | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/quota", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: Quota | null) => alive && data && setQuota(data));
    load();
    const off = onConversationsChanged(load);
    return () => {
      alive = false;
      off();
    };
  }, []);

  if (!quota) return null;
  const pct = Math.min(100, Math.round((quota.used / Math.max(1, quota.limit)) * 100));
  const level = pct >= 100 ? "full" : pct >= 80 ? "warn" : undefined;
  return (
    <div className={styles.quota}>
      <div className={styles.quotaHead}>
        <span>{quota.plan === "pro" ? "Plan Pro" : "Plan Free"}</span>
        <span className={styles.quotaCount}>
          {quota.used}/{quota.limit} hoy
        </span>
      </div>
      <div className="meter" data-level={level} role="meter" aria-label="Mensajes usados hoy" aria-valuenow={quota.used} aria-valuemin={0} aria-valuemax={quota.limit}>
        <span style={{ inlineSize: `${pct}%` }} />
      </div>
      {quota.plan === "free" && (
        <Link href="/settings?tab=billing" className={styles.upgrade}>
          Mejorar a Pro
        </Link>
      )}
    </div>
  );
}

/**
 * Panel junto al riel: chats agrupados por fecha, la navegación de la
 * plataforma o las sesiones de Nexo Code según la sección. En el celular es
 * el cajón.
 */
export function Sidebar({ onClose, workspaces, activeWorkspace }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
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
  const groups = groupByDate(items.filter((c) => !c.starred));

  async function patch(id: string, data: Partial<Pick<Conversation, "title" | "starred">> & { archived?: boolean }) {
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    notifyConversationsChanged();
  }

  async function archive(c: Conversation) {
    await patch(c.id, { archived: true });
    toast("Chat archivado. Lo encuentras en Ajustes → Datos.");
    if (activeId === c.id) router.push("/");
  }

  async function remove(id: string) {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    setDeleting(null);
    notifyConversationsChanged();
    if (activeId === id) router.push("/");
  }

  const renderItem = (c: Conversation) => (
    <li key={c.id} className={styles.item} data-active={activeId === c.id}>
      <Link href={`/chat/${c.id}`} className={styles.itemLink} title={c.title} aria-current={activeId === c.id ? "page" : undefined} onClick={closeOnMobile}>
        <span className={styles.itemTitle}>{c.title}</span>
      </Link>
      <Menu.Root>
        <Menu.Trigger className={styles.itemMenu} aria-label={`Opciones de ${c.title}`}>
          <MoreHorizontal size={16} />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content className="menu" align="start" sideOffset={4}>
            <Menu.Item className="menu-item" onSelect={() => patch(c.id, { starred: !c.starred })}>
              {c.starred ? <StarOff /> : <Star />} {c.starred ? "Desfijar" : "Fijar"}
            </Menu.Item>
            <Menu.Item className="menu-item" onSelect={() => setRenaming(c)}>
              <Pencil /> Renombrar
            </Menu.Item>
            <Menu.Item className="menu-item" onSelect={() => archive(c)}>
              <Archive /> Archivar
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

  const mode = pathname.startsWith("/platform") ? "platform" : codeNav && pathname.startsWith("/code") ? "code" : "chat";
  function closeOnMobile() {
    if (window.matchMedia("(max-width: 860px)").matches) onClose();
  }
  const heading = mode === "platform" ? "Plataforma" : mode === "code" ? "Nexo Code" : "Chats";
  const label = mode === "platform" ? "Plataforma" : mode === "code" ? "Sesiones de código" : "Conversaciones";

  return (
    <nav id="panel-historial" className={styles.panel} aria-label={label}>
      <div className={styles.head}>
        <h2 className={styles.heading}>{heading}</h2>
        <button className={`icon-btn ${styles.close}`} onClick={onClose} aria-label="Cerrar historial">
          <X />
        </button>
      </div>

      {mode === "code" && codeNav ? (
        <CodeSessions nav={codeNav} onPicked={closeOnMobile} />
      ) : mode === "platform" ? (
        <PlatformNav onPicked={closeOnMobile} />
      ) : (
        <>
          <div className={styles.actions}>
            <Link href="/" className={styles.newChat} onClick={closeOnMobile}>
              <SquarePen size={16} aria-hidden="true" />
              <span>Nuevo chat</span>
              <kbd className={styles.kbd}>Ctrl ⇧ O</kbd>
            </Link>
            <button type="button" className={styles.search} onClick={openSearch}>
              <Search size={16} aria-hidden="true" />
              <span>Buscar chats</span>
              <kbd className={styles.kbd}>Ctrl K</kbd>
            </button>
          </div>

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
            {groups.map((g, i) => (
              <section key={g.title} className={styles.group} aria-labelledby={`grupo-${i}`}>
                <h3 id={`grupo-${i}`} className={styles.groupTitle}>
                  {g.title}
                </h3>
                <ul>{g.items.map(renderItem)}</ul>
              </section>
            ))}
            {items.length === 0 && (
              <section className={styles.group} aria-labelledby="grupo-recientes">
                <h3 id="grupo-recientes" className={styles.groupTitle}>
                  Recientes
                </h3>
                <p className={styles.empty}>Aún no hay chats. Escribe algo y aparecerá aquí.</p>
              </section>
            )}
          </div>
        </>
      )}

      {mode !== "code" && <QuotaMeter />}

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
