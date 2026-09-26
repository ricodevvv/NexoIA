"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import {
  ArrowUpCircle,
  ChevronDown,
  Code2,
  FolderClosed,
  KeyRound,
  LogOut,
  MessageCircle,
  MessagesSquare,
  Monitor,
  Moon,
  MoreVertical,
  PanelLeft,
  Pencil,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Star,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { NexoLogo } from "./brand/logo";
import { CodeSessions, useCodeNav } from "./code/code-nav";
import { notifyConversationsChanged, onConversationsChanged } from "./events";
import styles from "./sidebar.module.css";
import { useDragToClose } from "./use-drag-to-close";
import { useShell } from "./shell";
import { useIsMobile } from "./use-is-mobile";
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

export function Sidebar({ user, plan, onToggle, workspaces, activeWorkspace }: Props) {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const pathname = usePathname();
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
    if (params.id === id) router.push("/");
  }

  const renderItem = (c: Conversation, pinned = false) => (
    <li key={c.id} className={styles.item} data-active={pathname.startsWith("/chat/") && params.id === c.id}>
      <Link href={`/chat/${c.id}`} className={styles.itemLink} title={c.title}>
        <span className={styles.bullet} data-pinned={pinned || undefined} aria-hidden="true" />
        {pinned && <MessageCircle size={17} className={styles.pinIcon} aria-hidden="true" />}
        <span className={styles.itemTitle}>{c.title}</span>
      </Link>
      <Menu.Root>
        <Menu.Trigger className={styles.itemMenu} aria-label={`Opciones de ${c.title}`}>
          <MoreVertical size={16} />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content className="menu" align="end" sideOffset={4}>
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

  return (
    <nav className={styles.sidebar} aria-label="Conversaciones">
      <div className={styles.top}>
        <button className={`icon-btn ${styles.close}`} onClick={onToggle} aria-label="Cerrar menú">
          <X />
        </button>
        <Link href="/" className={styles.brand} aria-label="Nexo, nuevo chat">
          <NexoLogo size={24} />
        </Link>
        <div className={styles.modes} role="group" aria-label="Modo">
          <Link href="/" className={styles.mode} data-active={!pathname.startsWith("/code")} aria-label="Chat" title="Chat">
            <MessagesSquare size={16} />
          </Link>
          <Link href="/code" className={styles.mode} data-active={pathname.startsWith("/code")} aria-label="Nexo Code" title="Nexo Code">
            <Code2 size={16} />
          </Link>
        </div>
        <button className={`icon-btn ${styles.collapse}`} onClick={onToggle} aria-label="Ocultar barra lateral">
          <PanelLeft />
        </button>
      </div>

      {codeNav && pathname.startsWith("/code") ? (
        <CodeSessions nav={codeNav} onPicked={() => window.matchMedia("(max-width: 860px)").matches && onToggle()} />
      ) : (
        <>
          <button type="button" className={styles.search} onClick={openSearch}>
            <Search size={18} aria-hidden="true" />
            <span>Buscar</span>
            <kbd className={styles.kbd}>Ctrl K</kbd>
          </button>

          <div className={styles.nav}>
            <Link href="/" className={styles.navLink} data-active={pathname === "/"}>
              <span className={styles.plus} aria-hidden="true">
                <Plus size={15} />
              </span>
              Nuevo chat
            </Link>
            <Link href="/projects" className={styles.navLink} data-active={pathname.startsWith("/projects")}>
              <FolderClosed size={19} aria-hidden="true" />
              Proyectos
            </Link>
            <Link href="/settings?tab=personalization" className={styles.navLink} data-active={pathname.startsWith("/settings")}>
              <SlidersHorizontal size={19} aria-hidden="true" />
              Personalizar
            </Link>
          </div>

          <div className={styles.switcherSlot}>
            <WorkspaceSwitcher workspaces={workspaces} active={activeWorkspace} />
          </div>

          <div className={styles.list}>
            {pinned.length > 0 && (
              <section className={styles.group}>
                <h2 className={styles.groupTitle}>Fijados</h2>
                <ul>{pinned.map((c) => renderItem(c, true))}</ul>
              </section>
            )}
            <section className={styles.group}>
              <div className={styles.groupHead}>
                <h2 className={styles.groupTitle}>Recientes</h2>
                <button type="button" className={styles.groupAction} onClick={openSearch} aria-label="Buscar chats" title="Buscar chats">
                  <Search size={15} />
                </button>
              </div>
              {recents.length === 0 ? <p className={styles.empty}>Tus chats van a aparecer aquí.</p> : <ul>{recents.map((c) => renderItem(c))}</ul>}
            </section>
          </div>
        </>
      )}

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

const THEMES = [
  { value: "system", label: "Sistema", Icon: Monitor },
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Oscuro", Icon: Moon },
] as const;

function UserMenu({ user, plan }: { user: Props["user"]; plan: Props["plan"] }) {
  const router = useRouter();
  const [theme, setTheme] = useTheme();
  const mobile = useIsMobile();
  const [sheet, setSheet] = useState(false);
  const { sheetRef, handleProps } = useDragToClose<HTMLDivElement>(() => setSheet(false));
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

  const actions = [
    { label: "Configuración", Icon: Settings, run: () => router.push("/settings") },
    ...(plan === "pro" ? [] : [{ label: "Mejorar plan", Icon: ArrowUpCircle, run: () => router.push("/settings?tab=billing") }]),
    { label: "Claves de API", Icon: KeyRound, run: () => router.push("/settings?tab=keys") },
  ];

  const trigger = (
    <>
      <span className={styles.avatar} aria-hidden="true">
        {initials}
      </span>
      <span className={styles.userName}>{user.name}</span>
      <span className={styles.userPlan}>· {plan === "pro" ? "Pro" : "Free"}</span>
      <ChevronDown size={15} aria-hidden="true" className={styles.userChevron} />
    </>
  );

  const themeSwitch = (
    <div className={styles.themeRow}>
      <span>Tema</span>
      <div className={styles.segmented} role="radiogroup" aria-label="Tema">
        {THEMES.map(({ value, label, Icon }) => (
          <button key={value} type="button" role="radio" aria-checked={theme === value} aria-label={label} title={label} onClick={() => setTheme(value)}>
            <Icon size={16} />
          </button>
        ))}
      </div>
    </div>
  );

  if (mobile) {
    return (
      <Dialog.Root open={sheet} onOpenChange={setSheet}>
        <Dialog.Trigger className={styles.user} aria-label="Cuenta">
          {trigger}
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.sheetOverlay} />
          <Dialog.Content ref={sheetRef} className={styles.sheet} aria-describedby={undefined} {...handleProps}>
            <span className={styles.grabber} aria-hidden="true" />
            <Dialog.Title className={styles.sheetEmail}>{user.email}</Dialog.Title>
            {actions.map(({ label, Icon, run }) => (
              <button
                key={label}
                type="button"
                className={styles.sheetItem}
                onClick={() => {
                  setSheet(false);
                  run();
                }}
              >
                <Icon size={19} /> {label}
              </button>
            ))}
            <hr className={styles.sheetSep} />
            {themeSwitch}
            <hr className={styles.sheetSep} />
            <button type="button" className={styles.sheetItem} onClick={logout}>
              <LogOut size={19} /> Cerrar sesión
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <Menu.Root>
      <Menu.Trigger className={styles.user} aria-label="Cuenta">
        {trigger}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className={`menu ${styles.userMenu}`} side="top" align="start" sideOffset={6}>
          <p className="menu-label label">{user.email}</p>
          {actions.map(({ label, Icon, run }) => (
            <Menu.Item key={label} className="menu-item" onSelect={run}>
              <Icon /> {label}
            </Menu.Item>
          ))}
          <Menu.Separator className="menu-sep" />
          <p className="menu-label label">Tema</p>
          <Menu.RadioGroup value={theme} onValueChange={(v) => setTheme(v as typeof theme)}>
            {THEMES.map(({ value, label, Icon }) => (
              <Menu.RadioItem key={value} className="menu-item" value={value}>
                <Icon /> {label}
              </Menu.RadioItem>
            ))}
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
