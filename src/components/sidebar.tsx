"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import {
  FolderClosed,
  LogOut,
  Monitor,
  Moon,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Search,
  Settings,
  SquarePen,
  Star,
  Sun,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { notifyConversationsChanged, onConversationsChanged } from "./events";
import styles from "./sidebar.module.css";
import { useShell } from "./shell";
import { useTheme } from "./use-theme";
import { WorkspaceSwitcher, type WorkspaceOption } from "./workspace-switcher";

type Conversation = { id: string; title: string; starred: boolean; updatedAt: string };

type Props = {
  user: { name: string; email: string; image: string | null };
  plan: "free" | "pro";
  onToggle: () => void;
  workspaces: WorkspaceOption[];
  activeWorkspace: string | null;
};

function groupOf(date: Date) {
  const now = new Date();
  const day = 86_400_000;
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = date.getTime();
  if (t >= startToday) return "Hoy";
  if (t >= startToday - day) return "Ayer";
  if (t >= startToday - 7 * day) return "Últimos 7 días";
  if (t >= startToday - 30 * day) return "Últimos 30 días";
  return "Anteriores";
}

export function Sidebar({ user, plan, onToggle, workspaces, activeWorkspace }: Props) {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const pathname = usePathname();
  const [items, setItems] = useState<Conversation[]>([]);
  const { openSearch } = useShell();
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

  const groups = useMemo(() => {
    const map = new Map<string, Conversation[]>();
    const starred = items.filter((c) => c.starred);
    if (starred.length) map.set("Destacados", starred);
    for (const c of items.filter((c) => !c.starred)) {
      const g = groupOf(new Date(c.updatedAt));
      map.set(g, [...(map.get(g) ?? []), c]);
    }
    return [...map.entries()];
  }, [items]);

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
    if (params.id === id) router.push("/");
  }

  return (
    <nav className={styles.sidebar} aria-label="Conversaciones">
      <div className={styles.top}>
        <Link href="/" className={styles.brand}>
          Nexo
        </Link>
        <button className="icon-btn" onClick={onToggle} aria-label="Ocultar barra lateral">
          <PanelLeft />
        </button>
      </div>

      <div className={styles.switcherSlot}>
        <WorkspaceSwitcher workspaces={workspaces} active={activeWorkspace} />
      </div>

      <div className={styles.actions}>
        <Link href="/" className={`btn ${styles.newChat}`}>
          <SquarePen size={15} />
          Nuevo chat
        </Link>
        <Link href="/projects" className={styles.navLink} data-active={pathname.startsWith("/projects")}>
          <FolderClosed size={15} aria-hidden="true" />
          Proyectos
        </Link>
        <button type="button" className={styles.search} onClick={openSearch}>
          <Search size={14} aria-hidden="true" />
          <span>Buscar chats</span>
          <kbd className={styles.kbd}>Ctrl K</kbd>
        </button>
      </div>

      <div className={styles.list}>
        {groups.length === 0 && (
          <p className={styles.empty}>Tus chats van a aparecer aquí.</p>
        )}
        {groups.map(([group, convs]) => (
          <section key={group} className={styles.group}>
            <h2 className="label">{group}</h2>
            <ul>
              {convs.map((c) => (
                <li key={c.id} className={styles.item} data-active={pathname.startsWith("/chat/") && params.id === c.id}>
                  <Link href={`/chat/${c.id}`} className={styles.itemLink} title={c.title}>
                    {c.title}
                  </Link>
                  <Menu.Root>
                    <Menu.Trigger className={styles.itemMenu} aria-label={`Opciones de ${c.title}`}>
                      <MoreHorizontal size={15} />
                    </Menu.Trigger>
                    <Menu.Portal>
                      <Menu.Content className="menu" align="start" sideOffset={4}>
                        <Menu.Item className="menu-item" onSelect={() => patch(c.id, { starred: !c.starred })}>
                          <Star /> {c.starred ? "Quitar de destacados" : "Destacar"}
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
              ))}
            </ul>
          </section>
        ))}
      </div>

      <UserMenu user={user} plan={plan} />

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

function UserMenu({ user, plan }: { user: Props["user"]; plan: Props["plan"] }) {
  const router = useRouter();
  const [theme, setTheme] = useTheme();
  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function logout() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <Menu.Root>
      <Menu.Trigger className={styles.user}>
        <span className={styles.avatar} aria-hidden="true">
          {initials}
        </span>
        <span className={styles.userText}>
          <span className={styles.userName}>{user.name}</span>
          <span className="label">Plan {plan === "pro" ? "Pro" : "Free"}</span>
        </span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="menu" side="top" align="start" sideOffset={6}>
          <p className="menu-label label">{user.email}</p>
          <Menu.Item className="menu-item" onSelect={() => router.push("/settings")}>
            <Settings /> Ajustes
          </Menu.Item>
          <Menu.Separator className="menu-sep" />
          <p className="menu-label label">Tema</p>
          <Menu.RadioGroup value={theme} onValueChange={(v) => setTheme(v as typeof theme)}>
            <Menu.RadioItem className="menu-item" value="system">
              <Monitor /> Sistema
            </Menu.RadioItem>
            <Menu.RadioItem className="menu-item" value="light">
              <Sun /> Claro
            </Menu.RadioItem>
            <Menu.RadioItem className="menu-item" value="dark">
              <Moon /> Oscuro
            </Menu.RadioItem>
          </Menu.RadioGroup>
          <Menu.Separator className="menu-sep" />
          <Menu.Item className="menu-item" onSelect={logout}>
            <LogOut /> Cerrar sesión
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
