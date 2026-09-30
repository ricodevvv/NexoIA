"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { Code2, FolderClosed, MessagesSquare, PanelLeftClose, PanelLeftOpen, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NexoMark } from "./brand/logo";
import styles from "./rail.module.css";
import { RailUserMenu, type MenuUser } from "./user-menu";

export type Section = "chat" | "code" | "projects" | "settings" | "other";

/**
 * Sección de la app según la ruta, para marcar el riel y la barra inferior.
 */
export function sectionOf(pathname: string): Section {
  if (pathname === "/" || pathname.startsWith("/chat")) return "chat";
  if (pathname.startsWith("/code")) return "code";
  if (pathname.startsWith("/projects")) return "projects";
  if (pathname.startsWith("/settings")) return "settings";
  return "other";
}

const MAIN = [
  { section: "chat", href: "/", label: "Chats", Icon: MessagesSquare },
  { section: "code", href: "/code", label: "Nexo Code", Icon: Code2 },
  { section: "projects", href: "/projects", label: "Proyectos", Icon: FolderClosed },
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
 * Riel de navegación fijo a la izquierda en escritorio: secciones arriba y
 * búsqueda, historial, ajustes y cuenta abajo.
 */
export function Rail({
  user,
  plan,
  panelOpen,
  onTogglePanel,
  onSearch,
}: {
  user: MenuUser;
  plan: "free" | "pro";
  panelOpen: boolean;
  onTogglePanel: () => void;
  onSearch: () => void;
}) {
  const section = sectionOf(usePathname());
  const PanelIcon = panelOpen ? PanelLeftClose : PanelLeftOpen;

  return (
    <Tooltip.Provider delayDuration={400} skipDelayDuration={300}>
      <nav className={styles.rail} aria-label="Principal">
        <Link href="/" className={styles.logo} aria-label="Nexo, nuevo chat">
          <NexoMark size={26} title="Nexo" />
        </Link>

        <ul className={styles.group}>
          {MAIN.map(({ section: id, href, label, Icon }) => (
            <li key={id}>
              <Tip label={label}>
                <Link href={href} className={styles.item} aria-label={label} aria-current={section === id ? "page" : undefined}>
                  <Icon size={20} aria-hidden="true" />
                </Link>
              </Tip>
            </li>
          ))}
        </ul>

        <ul className={`${styles.group} ${styles.bottom}`}>
          <li>
            <Tip label="Buscar" hint="Ctrl K">
              <button type="button" className={styles.item} onClick={onSearch} aria-label="Buscar" aria-keyshortcuts="Control+K Meta+K">
                <Search size={20} aria-hidden="true" />
              </button>
            </Tip>
          </li>
          <li>
            <Tip label={panelOpen ? "Ocultar historial" : "Mostrar historial"}>
              <button
                type="button"
                className={styles.item}
                onClick={onTogglePanel}
                aria-label={panelOpen ? "Ocultar historial" : "Mostrar historial"}
                aria-expanded={panelOpen}
                aria-controls="panel-historial"
              >
                <PanelIcon size={20} aria-hidden="true" />
              </button>
            </Tip>
          </li>
          <li>
            <Tip label="Configuración">
              <Link href="/settings" className={styles.item} aria-label="Configuración" aria-current={section === "settings" ? "page" : undefined}>
                <Settings size={20} aria-hidden="true" />
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
