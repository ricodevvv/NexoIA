"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { ExternalLinkDialog } from "./external-link";
import { SearchPalette } from "./search-palette";
import { Sidebar } from "./sidebar";
import styles from "./shell.module.css";
import { useStoredState } from "./use-stored-state";
import type { WorkspaceOption } from "./workspace-switcher";

type ShellUser = { name: string; email: string; image: string | null };

type ShellContextValue = {
  collapsed: boolean;
  toggle: () => void;
  openSearch: () => void;
};

const ShellContext = createContext<ShellContextValue>({ collapsed: false, toggle: () => {}, openSearch: () => {} });

export function useShell() {
  return useContext(ShellContext);
}

/**
 * Estructura base de la app: sidebar a la izquierda (cajón en móvil) y el
 * contenido a la derecha.
 */
export function Shell({
  user,
  plan,
  workspaces,
  activeWorkspace,
  children,
}: {
  user: ShellUser;
  plan: "free" | "pro";
  workspaces: WorkspaceOption[];
  activeWorkspace: string | null;
  children: React.ReactNode;
}) {
  const [sidebar, setSidebar] = useStoredState<"open" | "collapsed">("nexo-sidebar", "open");
  const [openAt, setOpenAt] = useState<string | null>(null);
  const pathname = usePathname();
  const collapsed = sidebar === "collapsed";
  const mobileOpen = openAt === pathname;
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggle() {
    if (window.matchMedia("(max-width: 860px)").matches) {
      setOpenAt(mobileOpen ? null : pathname);
      return;
    }
    setSidebar(collapsed ? "open" : "collapsed");
  }

  return (
    <ShellContext.Provider value={{ collapsed, toggle, openSearch: () => setSearchOpen(true) }}>
      <div className="shell" data-collapsed={collapsed}>
        <div className={styles.sidebarSlot} data-open={mobileOpen}>
          <Sidebar user={user} plan={plan} onToggle={toggle} workspaces={workspaces} activeWorkspace={activeWorkspace} />
        </div>
        {mobileOpen && <button className={styles.scrim} aria-label="Cerrar menú" onClick={() => setOpenAt(null)} />}
        <main className="main">{children}</main>
        <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
        <ExternalLinkDialog />
      </div>
    </ShellContext.Provider>
  );
}
