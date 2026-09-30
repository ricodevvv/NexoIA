"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { CodeNavProvider } from "./code/code-nav";
import { ExternalLinkDialog } from "./external-link";
import { Rail } from "./rail";
import { SearchPalette } from "./search-palette";
import { Sidebar } from "./sidebar";
import styles from "./shell.module.css";
import { TabBar } from "./tab-bar";
import { useIsMobile } from "./use-is-mobile";
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
 * Arrastrar el cajón hacia la izquierda en el celular: lo mueve con el dedo
 * junto con el contenido y lo cierra si se soltó a más de un tercio o rápido.
 */
function useDrawerSwipe(onClose: () => void) {
  const shellRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; t: number; axis: "x" | "y" | null; dx: number } | null>(null);

  function move(dx: number) {
    const slot = slotRef.current;
    const main = shellRef.current?.querySelector<HTMLElement>(".main");
    if (!slot || !main) return;
    const offset = Math.min(0, dx);
    slot.style.transform = offset ? `translateX(${offset}px)` : "";
    main.style.transform = offset ? `translateX(${slot.offsetWidth + offset}px)` : "";
  }

  return {
    shellRef,
    slotRef,
    handlers: {
      onPointerDown(e: React.PointerEvent) {
        if (e.pointerType === "mouse") return;
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, axis: null, dx: 0 };
      },
      onPointerMove(e: React.PointerEvent) {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (!d.axis && Math.hypot(dx, dy) > 8) {
          d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
          if (d.axis === "x") {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            shellRef.current?.setAttribute("data-dragging", "");
            slotRef.current?.setAttribute("data-dragging", "");
          }
        }
        if (d.axis !== "x") return;
        d.dx = dx;
        move(dx);
      },
      onPointerUp(e: React.PointerEvent) {
        const d = drag.current;
        drag.current = null;
        if (!d || d.id !== e.pointerId || d.axis !== "x") return;
        shellRef.current?.removeAttribute("data-dragging");
        slotRef.current?.removeAttribute("data-dragging");
        const width = slotRef.current?.offsetWidth ?? 1;
        const fast = d.dx / Math.max(1, e.timeStamp - d.t) < -0.5;
        move(0);
        if (-d.dx > width / 3 || fast) onClose();
      },
      onPointerCancel(e: React.PointerEvent) {
        if (drag.current?.id !== e.pointerId) return;
        drag.current = null;
        shellRef.current?.removeAttribute("data-dragging");
        slotRef.current?.removeAttribute("data-dragging");
        move(0);
      },
    },
  };
}

/**
 * Estructura base de la app: riel de secciones, panel de historial que se
 * puede ocultar y el contenido en un lienzo. En el celular el panel es un
 * cajón que se cierra deslizándolo y las secciones van en una barra inferior.
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
  const { shellRef, slotRef, handlers: swipe } = useDrawerSwipe(() => setOpenAt(null));
  const mobile = useIsMobile();
  const panelHidden = mobile ? !mobileOpen : collapsed;

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
      <CodeNavProvider>
        <a className="skip-link" href="#contenido">
          Saltar al contenido
        </a>
        <div ref={shellRef} className="shell" data-panel={collapsed ? "closed" : "open"} data-drawer={mobileOpen}>
          <div className={styles.railSlot}>
            <Rail user={user} plan={plan} panelOpen={!collapsed} onTogglePanel={toggle} onSearch={() => setSearchOpen(true)} />
          </div>
          <div ref={slotRef} className={styles.sidebarSlot} data-open={mobileOpen} inert={panelHidden} {...(mobileOpen ? swipe : {})}>
            <Sidebar onClose={() => setOpenAt(null)} workspaces={workspaces} activeWorkspace={activeWorkspace} />
          </div>
          {mobileOpen && <button className={styles.scrim} aria-label="Cerrar historial" onClick={() => setOpenAt(null)} />}
          <main id="contenido" className="main" tabIndex={-1}>
            {children}
          </main>
          <TabBar user={user} plan={plan} />
          <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
          <ExternalLinkDialog />
        </div>
      </CodeNavProvider>
    </ShellContext.Provider>
  );
}
