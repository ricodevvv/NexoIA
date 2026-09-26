"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { FileDiff as DiffIcon, PanelLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { withViewTransition } from "@/lib/motion";
import type { SetupEvent } from "@/lib/code-setup";
import { NexoLogo } from "../brand/logo";
import { Message } from "../chat/message";
import { useShell } from "../shell";
import { useStoredState } from "../use-stored-state";
import chat from "../chat/chat.module.css";
import { usePublishCodeNav } from "./code-nav";
import { CodeSession, type CodeModel } from "./code-session";
import { DiffPanel, type FileDiff } from "./diff-panel";
import { NewSession, type StartInput } from "./new-session";
import { type EnvironmentData, EnvironmentForm } from "./environment-form";
import { ServerForm } from "./server-form";
import { SetupRow, type SetupSteps } from "./setup";
import styles from "./code.module.css";

export type PublicServer = { id: string; name: string; url: string; directory: string | null; managed: boolean; hasPassword: boolean; cloud?: boolean };
type SessionItem = { id: string; title: string; updated: number };
type Boot = { text: string; repo: string | null; steps: SetupSteps; error: string | null };

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
  const [envDialog, setEnvDialog] = useState<null | { egress: boolean; env?: EnvironmentData }>(null);
  const [storedVariant, setStoredVariant] = useStoredState<string>(`nexo-code-variant:${serverId ?? ""}`, "");
  const [starting, setStarting] = useState(false);
  const [boot, setBoot] = useState<Boot | null>(null);
  const [draft, setDraft] = useState("");

  const model = models.find((m) => `${m.providerID}/${m.modelID}` === storedModel) ?? defaultModel;
  const variant = storedVariant && model?.variants?.includes(storedVariant) ? storedVariant : null;
  const title = sessionId ? (titles[sessionId] ?? sessions.find((s) => s.id === sessionId)?.title ?? "Sesión") : boot ? boot.text.slice(0, 60) : "Nexo Code";

  const diffUrl = serverId ? `/api/code/${serverId}/diff${sessionId ? `?session=${encodeURIComponent(sessionId)}` : ""}` : null;

  const loadDiff = useCallback(async () => {
    if (!diffUrl) return;
    setDiffLoading(true);
    const res = await fetch(diffUrl, { cache: "no-store" });
    setDiffLoading(false);
    if (res.ok) setDiff(await res.json());
  }, [diffUrl]);

  useEffect(() => {
    if (!diffUrl) return;
    let alive = true;
    fetch(diffUrl, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((files) => alive && setDiff(files));
    return () => {
      alive = false;
    };
  }, [diffUrl]);

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
    if (starting) return;
    setBoot(null);
    openSession(null);
  }

  async function startSession(input: StartInput) {
    if (!serverId) return;
    setStarting(true);
    const steps: SetupSteps = {};
    setBoot({ text: input.text, repo: input.repo?.fullName ?? null, steps, error: null });
    const fail = (message: string) => {
      setBoot((b) => b && { ...b, error: message });
      setStarting(false);
    };
    const res = await fetch(`/api/code/${serverId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: input.text,
        files: input.files,
        ask: input.ask,
        repo: input.repo?.fullName ?? null,
        branch: input.branch,
        agent: "build",
        model: model ? { providerID: model.providerID, modelID: model.modelID } : undefined,
        ...(variant ? { variant } : {}),
      }),
    }).catch(() => null);
    if (!res?.ok || !res.body) return fail((await res?.json().catch(() => ({})))?.error ?? "No se pudo iniciar la sesión");

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let session: { id: string; title: string } | null = null;
    let error: string | null = null;
    while (true) {
      const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
      if (value) buffer += value;
      const lines = buffer.split("\n");
      buffer = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as SetupEvent;
        if ("step" in event) {
          steps[event.step] = event.status;
          setBoot((b) => b && { ...b, steps: { ...steps } });
        } else if ("session" in event) session = event.session;
        else error = event.error;
      }
      if (done) break;
    }
    if (!session) return fail(error ?? "La conexión se cortó antes de terminar");
    const started = session;
    setSessions((all) => [{ id: started.id, title: started.title, updated: Date.now() }, ...all]);
    setStarting(false);
    setBoot(null);
    setDraft("");
    openSession(started.id);
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

  async function refreshServers(created: string | null) {
    const res = await fetch("/api/code/servers", { cache: "no-store" });
    const list: PublicServer[] = res.ok ? await res.json() : servers;
    setServers(list);
    setAdding(false);
    setEnvDialog(null);
    const next = created ?? list[0]?.id ?? null;
    if (next && next !== serverId) selectServer(next);
  }

  async function openEnvironment(serverIdToEdit: string | null) {
    const hasCloud = servers.some((s) => s.cloud);
    if (!serverIdToEdit && !hasCloud) {
      setAdding(true);
      return;
    }
    const res = await fetch("/api/code/environments", { cache: "no-store" });
    const data = res.ok ? ((await res.json()) as { environments: EnvironmentData[]; egress: boolean }) : { environments: [], egress: false };
    const env = serverIdToEdit ? data.environments.find((e) => e.serverId === serverIdToEdit) : undefined;
    setEnvDialog({ egress: data.egress, env });
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
            {(sessionId || boot) && <span className={styles.sessionSub}>{server.name}</span>}
          </h1>
          <button type="button" className={chat.countBtn} onClick={() => setDiffOpen((v) => !v)} aria-pressed={diffOpen} aria-label="Cambios">
            <DiffIcon size={17} aria-hidden="true" />
            <span>{diff.length}</span>
          </button>
        </header>
        {boot ? (
          <div className={chat.scroll}>
            <div className={chat.thread}>
              <Message message={{ id: "boot", role: "user", parts: [{ type: "text", text: boot.text }] }} live={false} isLast={false} busy={false} />
              <SetupRow steps={boot.steps} repo={boot.repo} cloud={Boolean(server.cloud)} />
              {boot.error && (
                <div className={chat.notice} data-level="error" role="alert">
                  <span className={styles.bootError}>{boot.error}</span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      setDraft(boot.text);
                      setBoot(null);
                    }}
                  >
                    Editar y reintentar
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : sessionId ? (
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
            cloud={Boolean(server.cloud)}
          />
        ) : (
          <NewSession
            userName={props.userName}
            initialText={draft}
            environments={servers.map((s) => ({ id: s.id, name: s.name, cloud: Boolean(s.cloud) }))}
            environment={serverId}
            onEnvironment={selectServer}
            onCreateEnvironment={() => openEnvironment(null)}
            onEditEnvironment={(id) => openEnvironment(id)}
            models={models}
            model={model}
            onModel={(m) => setStoredModel(`${m.providerID}/${m.modelID}`)}
            variant={variant}
            onVariant={(v) => setStoredVariant(v)}
            starting={starting}
            error={serverError}
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

      <Dialog.Root open={Boolean(envDialog)} onOpenChange={(o) => !o && setEnvDialog(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className={`dialog ${styles.envDialog}`} aria-describedby={undefined}>
            <Dialog.Title>{envDialog?.env ? `Editar ${envDialog.env.name}` : "Nuevo entorno en la nube"}</Dialog.Title>
            {envDialog && (
              <EnvironmentForm
                key={envDialog.env?.id ?? "new"}
                initial={envDialog.env}
                egress={envDialog.egress}
                onSaved={(env) => refreshServers(env.serverId)}
                onDeleted={() => refreshServers(null)}
                onCancel={() => setEnvDialog(null)}
              />
            )}
            {envDialog && !envDialog.env && (
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => {
                  setEnvDialog(null);
                  setAdding(true);
                }}
              >
                ¿Tienes tu propio nexocode? Conecta un servidor
              </button>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
