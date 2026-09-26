"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Plus, Server, Trash2 } from "lucide-react";
import { createContext, useContext, useState } from "react";
import styles from "./code.module.css";

export type CodeNav = {
  servers: { id: string; name: string; managed: boolean }[];
  serverId: string;
  sessions: { id: string; title: string; updated: number }[];
  titles: Record<string, string>;
  activeId: string | null;
  error: string | null;
  actions: {
    open: (id: string | null) => void;
    selectServer: (id: string) => void;
    addServer: () => void;
    removeServer: () => void;
  };
};

const NavContext = createContext<CodeNav | null>(null);
const PublishContext = createContext<(nav: CodeNav | null) => void>(() => {});

/**
 * Comparte las sesiones de Nexo Code entre la pantalla de código, que las
 * carga, y la barra lateral, que las lista. El setter va en su propio
 * contexto para que publicar no vuelva a pintar a quien publica.
 */
export function CodeNavProvider({ children }: { children: React.ReactNode }) {
  const [nav, setNav] = useState<CodeNav | null>(null);
  return (
    <PublishContext.Provider value={setNav}>
      <NavContext.Provider value={nav}>{children}</NavContext.Provider>
    </PublishContext.Provider>
  );
}

export function useCodeNav() {
  return useContext(NavContext);
}

export function usePublishCodeNav() {
  return useContext(PublishContext);
}

function relative(ms: number) {
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return new Date(ms).toLocaleDateString("es", { day: "numeric", month: "short" });
}

/**
 * Lo que muestra la barra lateral en modo código: el servidor, nueva sesión y
 * las sesiones recientes. `onPicked` avisa para cerrar el cajón en el celular.
 */
export function CodeSessions({ nav, onPicked }: { nav: CodeNav; onPicked: () => void }) {
  const server = nav.servers.find((s) => s.id === nav.serverId);
  const open = (id: string | null) => {
    nav.actions.open(id);
    onPicked();
  };

  return (
    <div className={styles.navPanel}>
      <Menu.Root>
        <Menu.Trigger className={styles.serverBtn} aria-label="Cambiar de servidor">
          <Server size={15} aria-hidden="true" />
          <span>{server?.name ?? "Servidor"}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content className="menu" align="start" sideOffset={6}>
            <p className="menu-label label">Servidores</p>
            {nav.servers.map((s) => (
              <Menu.Item key={s.id} className="menu-item" onSelect={() => nav.actions.selectServer(s.id)}>
                <Server /> <span className={styles.grow}>{s.name}</span>
                {s.id === nav.serverId && <span className="tag">Actual</span>}
              </Menu.Item>
            ))}
            <Menu.Separator className="menu-sep" />
            <Menu.Item className="menu-item" onSelect={nav.actions.addServer}>
              <Plus /> Conectar otro servidor
            </Menu.Item>
            {server && !server.managed && (
              <Menu.Item className="menu-item" data-danger onSelect={nav.actions.removeServer}>
                <Trash2 /> Quitar {server.name}
              </Menu.Item>
            )}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      <button type="button" className={styles.newSession} onClick={() => open(null)}>
        <Plus size={16} aria-hidden="true" /> Nueva sesión
      </button>
      {nav.error && <p className={styles.error}>{nav.error}</p>}
      <p className={styles.navHeading}>Recientes</p>
      {nav.sessions.length === 0 ? (
        <p className={styles.navEmpty}>Tus sesiones de código van a aparecer aquí.</p>
      ) : (
        <ul className={styles.sessionList} aria-label="Sesiones de código">
          {nav.sessions.map((s) => (
            <li key={s.id}>
              <button type="button" data-active={s.id === nav.activeId} onClick={() => open(s.id)}>
                <span className={styles.sessionTitle}>{nav.titles[s.id] ?? s.title}</span>
                <span className={styles.sessionTime}>{relative(s.updated)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
