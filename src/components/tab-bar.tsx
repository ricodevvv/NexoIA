"use client";

import { Code2, FolderClosed, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { sectionOf } from "./rail";
import styles from "./tab-bar.module.css";
import { SheetUserMenu, type MenuUser } from "./user-menu";

const TABS = [
  { section: "chat", href: "/", label: "Chats", Icon: MessagesSquare },
  { section: "code", href: "/code", label: "Code", Icon: Code2 },
  { section: "projects", href: "/projects", label: "Proyectos", Icon: FolderClosed },
] as const;

/**
 * Barra de pestañas inferior del celular. Se esconde sola mientras escribes
 * para que el teclado no se coma el espacio.
 */
export function TabBar({ user, plan }: { user: MenuUser; plan: "free" | "pro" }) {
  const section = sectionOf(usePathname());

  return (
    <nav className={styles.bar} aria-label="Secciones">
      {TABS.map(({ section: id, href, label, Icon }) => (
        <Link key={id} href={href} className={styles.tab} aria-current={section === id ? "page" : undefined}>
          <Icon size={22} aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
      <SheetUserMenu user={user} plan={plan} className={styles.tab} current={section === "settings"} />
    </nav>
  );
}
