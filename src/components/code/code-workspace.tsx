"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, FileDiff as DiffIcon, ListTree, PanelLeft, Plus, Server, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { NexoLogo } from "../brand/logo";
import { useShell } from "../shell";
import { useStoredState } from "../use-stored-state";
import chat from "../chat/chat.module.css";
import { CodeSession, type CodeModel } from "./code-session";
import { DiffPanel, type FileDiff } from "./diff-panel";
import { ServerForm } from "./server-form";
import styles from "./code.module.css";

export type PublicServer = { id: string; name: string; url: string; directory: string | null; managed: boolean; hasPassword: boolean };
type SessionItem = { id: string; title: string; updated: number };

function relative(ms: number) {
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return new Date(ms).toLocaleDateString("es", { day: "numeric", month: "short" });
}

function syncUrl(server: string | null, session: string | null) {
  const url = new URL(window.location.href);
  url.search = "";
  if (server) url.searchParams.set("server", server);
  if (session) url.searchParams.set("session", session);
  window.history.replaceState(null, "", url);
}

/**
 * Pantalla de Nexo Code: elige servidor y sesión, y muestra la sesión con su
 * panel de cambios. Si no hay servidores explica cómo conectar uno.
 */
export function CodeWorkspace(props: { servers: PublicServer[]; initialServer?: string; initialSession?: string }) {
  const { collapsed, toggle } = useShell();
  const [servers, setServers] = useState(props.servers);
  const [storedServer, setStoredServer] = useStoredState<string>("nexo-code-server", "");
  const [picked, setPicked] = useState(props.initialServer ?? null);
  const serverId = [picked, storedServer].find((id) => id && servers.some((s) => s.id === id)) ?? servers[0]?.id ?? null;
  const server = servers.find((s) => s.id === serverId) ?? null;
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(props.initialSession ?? null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [models, setModels] = useState<CodeModel[]>([]);
  const [defaultModel, setDefaultModel] = useState<CodeModel | null>(null);
  const [storedModel, setStoredModel] = useStoredState<string>(`nexo-code-model:${serverId ?? ""}`, "");
  const [diffOpen, setDiffOpen] = useState(false);
  const [diff, setDiff] = useState<FileDiff[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  const model = models.find((m) => `${m.providerID}/${m.modelID}` === storedModel) ?? defaultModel;
  const title = sessionId ? (titles[sessionId] ?? sessions.find((s) => s.id === sessionId)?.title ?? "Sesión") : "Nexo Code";

  const loadDiff = useCallback(async () => {
    if (!serverId) return;
    setDiffLoading(true);
    const res = await fetch(`/api/code/${serverId}/diff`, { cache: "no-store" });
    setDiffLoading(false);
    if (res.ok) setDiff(await res.json());
  }, [serverId]);

  useEffect(() => {
    if (!serverId) return;
    let alive = true;
    fetch(`/api/code/${serverId}/sessions`, { cache: "no-store" })
      .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (!alive) return;
        setServerError(ok ? null : (data.error ?? "No pude conectar con el servidor"));
        setSessions(ok ? data : []);
      });
    fetch(`/api/code/${serverId}/models`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!alive || !data) return;
        const list = data.models as CodeModel[];
        setModels(list);
        setDefaultModel(list.find((m) => m.providerID === data.default?.providerID && m.modelID === data.default?.modelID) ?? list[0] ?? null);
      });
    fetch(`/api/code/${serverId}/diff`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((files) => alive && setDiff(files));
    return () => {
      alive = false;
    };
  }, [serverId]);

  function selectServer(id: string) {
    setPicked(id);
    setStoredServer(id);
    setSessionId(null);
    setSessions([]);
    syncUrl(id, null);
  }

  function openSession(id: string | null) {
    setSessionId(id);
    setListOpen(false);
    syncUrl(serverId, id);
  }

  async function newSession() {
    if (!serverId) return;
    const res = await fetch(`/api/code/${serverId}/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setServerError(data.error ?? "No se pudo crear la sesión");
      return;
    }
    setSessions((all) => [{ id: data.id, title: data.title, updated: Date.now() }, ...all]);
    openSession(data.id);
  }

  async function removeServer() {
    if (!server || server.managed) return;
    if (!window.confirm(`¿Quitar ${server.name} de Nexo? Las sesiones siguen en tu servidor.`)) return;
    await fetch(`/api/code/servers/${server.id}`, { method: "DELETE" });
    const rest = servers.filter((s) => s.id !== server.id);
    setServers(rest);
    setSessionId(null);
    syncUrl(null, null);
  }

  async function refreshServers(created: string) {
    const res = await fetch("/api/code/servers", { cache: "no-store" });
    if (res.ok) setServers(await res.json());
    setAdding(false);
    selectServer(created);
  }

  const onTitle = useCallback(
    (t: string) => {
      if (!sessionId) return;
      setTitles((all) => ({ ...all, [sessionId]: t }));
      setSessions((all) => all.map((s) => (s.id === sessionId ? { ...s, title: t } : s)));
    },
    [sessionId],
  );

  if (!server) {
    return (
      <div className={styles.onboarding}>
        <header className={chat.header} data-collapsed={collapsed}>
          <button className={`icon-btn ${chat.menuBtn}`} onClick={toggle} aria-label="Mostrar barra lateral">
            <PanelLeft />
          </button>
        </header>
        <div className={styles.onboardingBody}>
          <NexoLogo size={30} product="code" />
          <h1>Programa con un agente desde Nexo</h1>
          <p>
            Nexo Code se conecta a <code>nexocode</code> corriendo en tu máquina o en un servidor tuyo. El agente lee tu proyecto, corre comandos y
            edita archivos; tú ves todo aquí y apruebas lo delicado.
          </p>
          <ol className={styles.steps}>
            <li>
              Arranca el servidor en la carpeta de tu proyecto:
              <pre>NEXOCODE_SERVER_PASSWORD=una-clave nexocode serve --port 4096</pre>
            </li>
            <li>
              Exponlo con https, por ejemplo con un túnel:
              <pre>cloudflared tunnel --url http://localhost:4096</pre>
            </li>
            <li>Pega aquí la URL y la contraseña.</li>
          </ol>
          <ServerForm onCreated={refreshServers} />
        </div>
      </div>
    );
  }

  const list = (
    <nav className={styles.rail} aria-label="Sesiones de código" data-open={listOpen}>
      <div className={styles.railHead}>
        <Menu.Root>
          <Menu.Trigger className={styles.serverBtn} aria-label="Cambiar de servidor">
            <Server size={15} aria-hidden="true" />
            <span>{server.name}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content className="menu" align="start" sideOffset={6}>
              <p className="menu-label label">Servidores</p>
              {servers.map((s) => (
                <Menu.Item key={s.id} className="menu-item" onSelect={() => selectServer(s.id)}>
                  <Server /> <span className={styles.grow}>{s.name}</span>
                  {s.id === server.id && <span className="tag">Actual</span>}
                </Menu.Item>
              ))}
              <Menu.Separator className="menu-sep" />
              <Menu.Item className="menu-item" onSelect={() => setAdding(true)}>
                <Plus /> Conectar otro servidor
              </Menu.Item>
              {!server.managed && (
                <Menu.Item className="menu-item" data-danger onSelect={removeServer}>
                  <Trash2 /> Quitar {server.name}
                </Menu.Item>
              )}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
        <button className={`icon-btn ${styles.railClose}`} onClick={() => setListOpen(false)} aria-label="Cerrar sesiones">
          <X />
        </button>
      </div>
      <button type="button" className={styles.newSession} onClick={newSession}>
        <Plus size={16} aria-hidden="true" /> Nueva sesión
      </button>
      {serverError && <p className={styles.error}>{serverError}</p>}
      <ul className={styles.sessionList}>
        {sessions.map((s) => (
          <li key={s.id}>
            <button type="button" data-active={s.id === sessionId} onClick={() => openSession(s.id)}>
              <span className={styles.sessionTitle}>{titles[s.id] ?? s.title}</span>
              <span className={styles.sessionTime}>{relative(s.updated)}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );

  return (
    <div className={styles.workspace} data-diff={diffOpen}>
      {list}
      {listOpen && <button className={styles.scrim} aria-label="Cerrar sesiones" onClick={() => setListOpen(false)} />}
      <div className={`${chat.chat} ${styles.main}`}>
        <header className={chat.header} data-collapsed={collapsed}>
          <button className={`icon-btn ${chat.menuBtn}`} onClick={toggle} aria-label="Mostrar barra lateral">
            <PanelLeft />
          </button>
          <button className={`icon-btn ${styles.listBtn}`} onClick={() => setListOpen(true)} aria-label="Ver sesiones">
            <ListTree />
          </button>
          <h1 className={chat.title}>
            <span className={chat.titleText}>{title}</span>
          </h1>
          <button type="button" className={chat.countBtn} onClick={() => setDiffOpen((v) => !v)} aria-pressed={diffOpen} aria-label="Cambios">
            <DiffIcon size={17} aria-hidden="true" />
            <span>{diff.length}</span>
          </button>
        </header>
        {sessionId ? (
          <CodeSession
            key={`${serverId}:${sessionId}`}
            serverId={server.id}
            sessionId={sessionId}
            models={models}
            model={model}
            onModel={(m) => setStoredModel(`${m.providerID}/${m.modelID}`)}
            onTitle={onTitle}
            onChanges={loadDiff}
          />
        ) : (
          <div className={styles.pick}>
            <NexoLogo size={28} product="code" />
            <p>
              Conectado a <strong>{server.name}</strong>
              {server.directory ? (
                <>
                  {" "}
                  en <code>{server.directory}</code>
                </>
              ) : null}
              .
            </p>
            <button type="button" className="btn btn-primary" onClick={newSession}>
              <Plus size={16} /> Nueva sesión
            </button>
            {sessions.length > 0 && <p className={styles.muted}>o elige una sesión anterior de la lista.</p>}
          </div>
        )}
      </div>
      {diffOpen && <DiffPanel files={diff} loading={diffLoading} onRefresh={loadDiff} onClose={() => setDiffOpen(false)} />}

      <Dialog.Root open={adding} onOpenChange={setAdding}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog" aria-describedby={undefined}>
            <Dialog.Title>Conectar un servidor de nexocode</Dialog.Title>
            <ServerForm onCreated={refreshServers} onCancel={() => setAdding(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
