"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { FileDiff as DiffIcon, PanelLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { withViewTransition } from "@/lib/motion";
import { NexoLogo } from "../brand/logo";
import { useShell } from "../shell";
import { useStoredState } from "../use-stored-state";
import chat from "../chat/chat.module.css";
import { usePublishCodeNav } from "./code-nav";
import { CodeSession, type CodeModel } from "./code-session";
import { DiffPanel, type FileDiff } from "./diff-panel";
import { NewSession, type StartInput } from "./new-session";
import { ServerForm } from "./server-form";
import styles from "./code.module.css";

export type PublicServer = { id: string; name: string; url: string; directory: string | null; managed: boolean; hasPassword: boolean; cloud?: boolean };
type SessionItem = { id: string; title: string; updated: number };

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
export function CodeWorkspace(props: { servers: PublicServer[]; initialServer?: string; initialSession?: string; userName: string }) {
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
  const [storedVariant, setStoredVariant] = useStoredState<string>(`nexo-code-variant:${serverId ?? ""}`, "");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const model = models.find((m) => `${m.providerID}/${m.modelID}` === storedModel) ?? defaultModel;
  const variant = storedVariant && model?.variants?.includes(storedVariant) ? storedVariant : null;
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
    const update = () => setSessionId(id);
    if (id !== sessionId && window.matchMedia("(max-width: 860px)").matches) withViewTransition(update, "nav-forward");
    else update();
    syncUrl(serverId, id);
  }

  function newSession() {
    setStartError(null);
    openSession(null);
  }

  async function startSession(input: StartInput) {
    if (!serverId) return;
    setStarting(true);
    setStartError(null);
    const fail = (message: string) => {
      setStartError(message);
      setStarting(false);
    };
    const created = await fetch(`/api/code/${serverId}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: input.text.slice(0, 60), ask: input.ask }),
    });
    const session = await created.json().catch(() => ({}));
    if (!created.ok) return fail(session.error ?? "No se pudo crear la sesión");
    const context = input.repo
      ? `Trabaja en el repositorio de GitHub ${input.repo.fullName} (rama por defecto: ${input.repo.defaultBranch}${input.repo.canPush ? "" : ", solo lectura"}). Si todavía no está en la carpeta del proyecto, clónalo con \`git clone https://github.com/${input.repo.fullName}.git\` y trabaja dentro de esa carpeta. git y gh ya están autenticados.`
      : undefined;
    const prompt = await fetch(`/api/code/${serverId}/sessions/${encodeURIComponent(session.id)}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: input.text,
        files: input.files,
        context,
        agent: "build",
        model: model ? { providerID: model.providerID, modelID: model.modelID } : undefined,
        ...(variant ? { variant } : {}),
      }),
    });
    if (!prompt.ok) return fail((await prompt.json().catch(() => ({}))).error ?? "No se pudo mandar tu mensaje");
    setSessions((all) => [{ id: session.id, title: session.title, updated: Date.now() }, ...all]);
    setStarting(false);
    openSession(session.id);
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

  const publish = usePublishCodeNav();
  const open = (id: string | null) => (id ? openSession(id) : newSession());
  const handlers = useRef({ open, selectServer, addServer: () => setAdding(true), removeServer });
  useEffect(() => {
    handlers.current = { open, selectServer, addServer: () => setAdding(true), removeServer };
  });
  useEffect(() => {
    if (!serverId) {
      publish(null);
      return;
    }
    publish({
      servers: servers.map((s) => ({ id: s.id, name: s.name, managed: s.managed })),
      serverId,
      sessions,
      titles,
      activeId: sessionId,
      error: serverError,
      actions: {
        open: (id) => handlers.current.open(id),
        selectServer: (id) => handlers.current.selectServer(id),
        addServer: () => handlers.current.addServer(),
        removeServer: () => handlers.current.removeServer(),
      },
    });
  }, [publish, servers, serverId, sessions, titles, sessionId, serverError]);
  useEffect(() => () => publish(null), [publish]);

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

  return (
    <div className={styles.workspace} data-diff={diffOpen}>
      <div className={`${chat.chat} ${styles.main}`}>
        <header className={`${chat.header} ${sessionId ? "" : styles.startHeader}`} data-collapsed={collapsed}>
          <button className={`icon-btn ${chat.menuBtn}`} onClick={toggle} aria-label="Mostrar barra lateral">
            <PanelLeft />
          </button>
          <h1 className={`${chat.title} ${styles.sessionTitleBlock}`}>
            <span className={chat.titleText}>{title}</span>
            {sessionId && <span className={styles.sessionSub}>{server.name}</span>}
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
            variant={variant}
          />
        ) : (
          <NewSession
            userName={props.userName}
            environments={servers.map((s) => ({ id: s.id, name: s.name, cloud: Boolean(s.cloud) }))}
            environment={serverId}
            onEnvironment={selectServer}
            onCreateEnvironment={() => setAdding(true)}
            models={models}
            model={model}
            onModel={(m) => setStoredModel(`${m.providerID}/${m.modelID}`)}
            variant={variant}
            onVariant={(v) => setStoredVariant(v)}
            starting={starting}
            error={startError ?? serverError}
            onBack={toggle}
            onStart={startSession}
          />
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
