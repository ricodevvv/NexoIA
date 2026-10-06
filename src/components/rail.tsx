"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { Code2, FolderClosed, LayoutDashboard, MessagesSquare, PanelLeftClose, PanelLeftOpen, Search, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NexoMark } from "./brand/logo";
import styles from "./rail.module.css";
import { RailUserMenu, type MenuUser } from "./user-menu";

export type Section = "chat" | "code" | "projects" | "platform" | "workspace" | "settings" | "other";

/**
 * Sección de la app según la ruta, para marcar el riel y la barra inferior.
 */
export function sectionOf(pathname: string): Section {
  if (pathname === "/" || pathname.startsWith("/chat")) return "chat";
  if (pathname.startsWith("/code")) return "code";
  if (pathname.startsWith("/projects")) return "projects";
  if (pathname.startsWith("/platform")) return "platform";
  if (pathname.startsWith("/workspace")) return "workspace";
  if (pathname.startsWith("/settings")) return "settings";
  return "other";
}

export const SECTIONS = [
  { section: "chat", href: "/", label: "Chats", Icon: MessagesSquare },
  { section: "projects", href: "/projects", label: "Proyectos", Icon: FolderClosed },
  { section: "code", href: "/code", label: "Code", Icon: Code2 },
  { section: "platform", href: "/platform", label: "Plataforma", Icon: LayoutDashboard },
] as const;

function Tip({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className={styles.tip} side="right" sideOffset={10}>
          {label}
          {hint && <kbd>{hint}</kbd>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/**
 * Riel de navegación fijo a la izquierda en escritorio: secciones con su
 * nombre arriba y búsqueda, panel, ajustes y cuenta abajo.
 */
export function Rail({
  user,
  plan,
  panelOpen,
  hasTeam,
  onTogglePanel,
  onSearch,
}: {
  user: MenuUser;
  plan: "free" | "pro";
  panelOpen: boolean;
  hasTeam: boolean;
  onTogglePanel: () => void;
  onSearch: () => void;
}) {
  const section = sectionOf(usePathname());
  const PanelIcon = panelOpen ? PanelLeftClose : PanelLeftOpen;
  const items = hasTeam ? [...SECTIONS, { section: "workspace", href: "/workspace", label: "Equipo", Icon: Users } as const] : SECTIONS;

  return (
    <Tooltip.Provider delayDuration={400} skipDelayDuration={300}>
      <nav className={styles.rail} aria-label="Principal">
        <Link href="/" className={styles.logo} aria-label="Nexo, nuevo chat">
          <NexoMark size={26} title="Nexo" />
        </Link>

        <ul className={styles.group}>
          {items.map(({ section: id, href, label, Icon }) => (
            <li key={id}>
              <Link href={href} className={styles.item} aria-current={section === id ? "page" : undefined}>
                <span className={styles.icon}>
                  <Icon size={19} aria-hidden="true" />
                </span>
                <span className={styles.itemLabel}>{label}</span>
              </Link>
            </li>
          ))}
        </ul>

        <ul className={`${styles.group} ${styles.bottom}`}>
          <li>
            <Tip label="Buscar" hint="Ctrl K">
              <button type="button" className={styles.tool} onClick={onSearch} aria-label="Buscar" aria-keyshortcuts="Control+K Meta+K">
                <Search size={19} aria-hidden="true" />
              </button>
            </Tip>
          </li>
          <li>
            <Tip label={panelOpen ? "Ocultar panel" : "Mostrar panel"} hint="Ctrl ⇧ S">
              <button
                type="button"
                className={styles.tool}
                onClick={onTogglePanel}
                aria-label={panelOpen ? "Ocultar historial" : "Mostrar historial"}
                aria-expanded={panelOpen}
                aria-controls="panel-historial"
              >
                <PanelIcon size={19} aria-hidden="true" />
              </button>
            </Tip>
          </li>
          <li>
            <Tip label="Configuración">
              <Link href="/settings" className={styles.tool} aria-label="Configuración" aria-current={section === "settings" ? "page" : undefined}>
                <Settings size={19} aria-hidden="true" />
              </Link>
            </Tip>
          </li>
          <li className={styles.account}>
            <RailUserMenu user={user} plan={plan} />
          </li>
        </ul>
      </nav>
    </Tooltip.Provider>
  );
}
