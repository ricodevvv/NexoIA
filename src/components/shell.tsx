"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { Sidebar } from "./sidebar";
import styles from "./shell.module.css";
import { useStoredState } from "./use-stored-state";

type ShellUser = { name: string; email: string; image: string | null };

type ShellContextValue = {
  collapsed: boolean;
  toggle: () => void;
};

const ShellContext = createContext<ShellContextValue>({ collapsed: false, toggle: () => {} });

export function useShell() {
  return useContext(ShellContext);
}

/**
 * Estructura base de la app: sidebar a la izquierda (cajón en móvil) y el
 * contenido a la derecha.
 */
export function Shell({ user, plan, children }: { user: ShellUser; plan: "free" | "pro"; children: React.ReactNode }) {
  const [sidebar, setSidebar] = useStoredState<"open" | "collapsed">("nexo-sidebar", "open");
  const [openAt, setOpenAt] = useState<string | null>(null);
  const pathname = usePathname();
  const collapsed = sidebar === "collapsed";
  const mobileOpen = openAt === pathname;

  function toggle() {
    if (window.matchMedia("(max-width: 860px)").matches) {
      setOpenAt(mobileOpen ? null : pathname);
      return;
    }
    setSidebar(collapsed ? "open" : "collapsed");
  }

  return (
    <ShellContext.Provider value={{ collapsed, toggle }}>
      <div className="shell" data-collapsed={collapsed}>
        <div className={styles.sidebarSlot} data-open={mobileOpen}>
          <Sidebar user={user} plan={plan} onToggle={toggle} />
        </div>
        {mobileOpen && <button className={styles.scrim} aria-label="Cerrar menú" onClick={() => setOpenAt(null)} />}
        <main className="main">{children}</main>
      </div>
    </ShellContext.Provider>
  );
}
