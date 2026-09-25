"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { ArrowDown, ArrowUp, Check, ChevronDown, CornerDownLeft, ShieldQuestion, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThinkingLine } from "../chat/activity";
import { Message } from "../chat/message";
import chat from "../chat/chat.module.css";
import { applyNcEvent, initialState, type NcEvent, type NcMessage, type SessionState, toUIMessages } from "./map";
import { QuestionCard, type QuestionRequest } from "./question-card";
import styles from "./code.module.css";

export type CodeModel = { providerID: string; modelID: string; label: string; provider: string };

type Permission = { id: string; permission: string; patterns: string[]; metadata?: Record<string, unknown> };

type Props = {
  serverId: string;
  sessionId: string;
  models: CodeModel[];
  model: CodeModel | null;
  onModel: (m: CodeModel) => void;
  onTitle: (title: string) => void;
  onChanges: () => void;
};

const AGENTS = [
  { id: "build", label: "Construir", hint: "Puede editar archivos y correr comandos" },
  { id: "plan", label: "Planear", hint: "Solo lee y propone, no toca nada" },
] as const;

function permissionText(p: Permission) {
  const command = typeof p.metadata?.command === "string" ? p.metadata.command : null;
  const what: Record<string, string> = {
    bash: "ejecutar un comando",
    edit: "editar archivos",
    write: "crear archivos",
    webfetch: "leer una página web",
    external_directory: "salir de la carpeta del proyecto",
  };
  return { title: `Nexo Code quiere ${what[p.permission] ?? `usar ${p.permission}`}`, detail: command ?? p.patterns.join("\n") };
}

/**
 * Una sesión de Nexo Code: carga los mensajes, escucha los eventos en vivo y
 * deja escribir, parar y responder los permisos que pide el agente.
 */
export function CodeSession({ serverId, sessionId, models, model, onModel, onTitle, onChanges }: Props) {
  const [state, setState] = useState<SessionState>({ messages: {} });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [agent, setAgent] = useState<"build" | "plan">("build");
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [questions, setQuestions] = useState<QuestionRequest[]>([]);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const lastTopRef = useRef(0);
  const readyRef = useRef<Promise<void>>(Promise.resolve());
  const lastEventRef = useRef(0);
  const busyRef = useRef(false);
  const base = `/api/code/${serverId}/sessions/${encodeURIComponent(sessionId)}`;

  const load = useCallback(() => {
    fetch(base, { cache: "no-store" })
      .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        setLoading(false);
        if (!ok) {
          setError(data.error ?? "No pude abrir la sesión");
          return;
        }
        setError(null);
        setState(initialState(data.messages as NcMessage[]));
        setBusy(Boolean(data.busy));
        setPermissions((data.permissions ?? []) as Permission[]);
        setQuestions((data.questions ?? []) as QuestionRequest[]);
      });
  }, [base]);

  useEffect(() => {
    let queue: NcEvent[] = [];
    let frame = 0;
    let opened = false;
    const flush = () => {
      frame = 0;
      const events = queue;
      queue = [];
      setState((s) => events.reduce(applyNcEvent, s));
    };
    load();
    const source = new EventSource(`/api/code/${serverId}/events?session=${encodeURIComponent(sessionId)}`);
    let markReady = () => {};
    readyRef.current = new Promise((resolve) => (markReady = resolve));
    source.onopen = () => {
      if (opened) load();
      opened = true;
      markReady();
    };
    source.onmessage = (e) => {
      lastEventRef.current = Date.now();
      const event = JSON.parse(e.data) as { type: string; properties: Record<string, unknown> };
      const p = event.properties;
      if (event.type === "session.status") {
        const status = (p.status as { type: string }).type;
        setBusy(status !== "idle");
        if (status === "idle") onChanges();
        return;
      }
      if (event.type === "session.idle") {
        setBusy(false);
        onChanges();
        return;
      }
      if (event.type === "session.error") {
        const err = p.error as { data?: { message?: string }; name?: string } | undefined;
        if (err?.name !== "MessageAbortedError") setError(err?.data?.message ?? "El agente tuvo un error");
        return;
      }
      if (event.type === "session.updated") {
        const title = (p.info as { title?: string } | undefined)?.title;
        if (title) onTitle(title);
        return;
      }
      if (event.type === "session.diff") {
        onChanges();
        return;
      }
      if (event.type === "permission.asked") {
        setPermissions((all) => [...all.filter((x) => x.id !== p.id), p as unknown as Permission]);
        return;
      }
      if (event.type === "question.asked") {
        setQuestions((all) => [...all.filter((x) => x.id !== p.id), p as unknown as QuestionRequest]);
        return;
      }
      if (event.type === "question.replied" || event.type === "question.rejected") {
        setQuestions((all) => all.filter((x) => x.id !== p.requestID));
        return;
      }
      if (event.type === "permission.replied") {
        setPermissions((all) => all.filter((x) => x.id !== p.requestID));
        return;
      }
      queue.push(event as NcEvent);
      if (!frame) frame = requestAnimationFrame(flush);
    };
    const poll = setInterval(() => {
      if (busyRef.current && Date.now() - lastEventRef.current > 3000) load();
    }, 2000);
    return () => {
      source.close();
      clearInterval(poll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [serverId, sessionId, load, onTitle, onChanges]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const messages = useMemo(() => toUIMessages(state), [state]);
  const lastId = messages.at(-1)?.id;

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTo({ top: el.scrollHeight });
  }, [messages, permissions]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (el.scrollTop < lastTopRef.current - 2) stickRef.current = false;
    else if (distance < 24) stickRef.current = true;
    lastTopRef.current = el.scrollTop;
    setAtBottom(distance < 120);
  }

  async function send() {
    const value = text.trim();
    if (!value || busy) return;
    setText("");
    setBusy(true);
    setError(null);
    stickRef.current = true;
    lastEventRef.current = Date.now();
    await Promise.race([readyRef.current, new Promise((r) => setTimeout(r, 4000))]);
    const res = await fetch(`${base}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: value, agent, model: model ? { providerID: model.providerID, modelID: model.modelID } : undefined }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo mandar el mensaje");
      setBusy(false);
      setText(value);
    }
  }

  async function stop() {
    await fetch(`${base}/abort`, { method: "POST" });
  }

  async function answer(id: string, reply: "once" | "always" | "reject") {
    setPermissions((all) => all.filter((x) => x.id !== id));
    const res = await fetch(`/api/code/${serverId}/permissions/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "No se pudo responder el permiso");
  }

  async function answerQuestion(id: string, body: { answers: string[][] } | { reject: true }) {
    setQuestions((all) => all.filter((x) => x.id !== id));
    const res = await fetch(`/api/code/${serverId}/questions/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "No se pudo mandar tu respuesta");
  }

  const current = AGENTS.find((a) => a.id === agent)!;

  return (
    <>
      <div className={chat.scroll} ref={scrollRef} onScroll={onScroll} onWheel={(e) => e.deltaY < 0 && (stickRef.current = false)}>
        <div className={chat.thread}>
          {loading && <p className={styles.muted}>Cargando la sesión…</p>}
          {!loading && messages.length === 0 && !error && (
            <div className={styles.emptySession}>
              <h2>¿Qué hacemos en este proyecto?</h2>
              <p>Pídele que explique el código, arregle un bug o agregue algo. En modo Planear solo lee y te propone cómo hacerlo.</p>
            </div>
          )}
          {messages.map((m) => (
            <Message key={m.id} message={m} live={busy && m.id === lastId && m.role === "assistant"} isLast={m.id === lastId} busy={busy} />
          ))}
          {busy && messages.at(-1)?.role !== "assistant" && (
            <ThinkingLine />
          )}
          {error && (
            <div className={chat.notice} data-level="error" role="alert">
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
      {!atBottom && (
        <button
          className={chat.toBottom}
          onClick={() => {
            stickRef.current = true;
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
          }}
          aria-label="Ir al final"
        >
          <ArrowDown size={16} />
        </button>
      )}
      <div className={chat.dock}>
        {questions.map((q) => (
          <QuestionCard
            key={q.id}
            request={q}
            onAnswer={(answers) => answerQuestion(q.id, { answers })}
            onSkip={() => answerQuestion(q.id, { reject: true })}
          />
        ))}
        {permissions.map((p) => {
          const info = permissionText(p);
          return (
            <div key={p.id} className={styles.permission} role="alertdialog" aria-label={info.title}>
              <div className={styles.permissionHead}>
                <ShieldQuestion size={18} aria-hidden="true" />
                <strong>{info.title}</strong>
              </div>
              {info.detail && <pre>{info.detail}</pre>}
              <div className={styles.permissionActions}>
                <button type="button" className="btn btn-sm" onClick={() => answer(p.id, "reject")}>
                  Rechazar
                </button>
                <button type="button" className="btn btn-sm" onClick={() => answer(p.id, "always")}>
                  Permitir siempre
                </button>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => answer(p.id, "once")}>
                  Permitir una vez
                </button>
              </div>
            </div>
          );
        })}
        <div className={chat.composerWrap}>
          <div className={chat.composer}>
            <label className="sr-only" htmlFor="code-input">
              Instrucción para Nexo Code
            </label>
            <textarea
              id="code-input"
              className={chat.input}
              rows={1}
              value={text}
              placeholder={agent === "plan" ? "¿Qué quieres planear?" : "Pídele un cambio al código…"}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <div className={chat.toolbar}>
              <div className={chat.toolbarLeft}>
                <div className={styles.agents} role="radiogroup" aria-label="Modo">
                  {AGENTS.map((a) => (
                    <button key={a.id} type="button" role="radio" aria-checked={agent === a.id} title={a.hint} onClick={() => setAgent(a.id)}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={chat.toolbarRight}>
                {busy ? (
                  <button type="button" className={chat.send} data-stop onClick={stop} aria-label="Detener">
                    <Square size={12} fill="currentColor" />
                  </button>
                ) : (
                  <button type="button" className={chat.send} onClick={send} disabled={!text.trim()} aria-label="Enviar">
                    <ArrowUp size={18} strokeWidth={2.25} className={chat.sendArrow} />
                    <CornerDownLeft size={18} className={chat.sendEnter} />
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className={`${chat.composerFoot} ${styles.codeFoot}`}>
            <span className={chat.disclaimer}>{current.hint}</span>
            {models.length > 0 && (
              <Menu.Root>
                <Menu.Trigger className={chat.modelTrigger} aria-label="Modelo">
                  <span className={chat.modelTriggerName}>{model?.label ?? "Modelo"}</span>
                  <ChevronDown size={13} aria-hidden="true" />
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Content className={`menu ${chat.modelMenu}`} side="top" align="end" sideOffset={8}>
                    {models.map((m) => (
                      <Menu.Item key={`${m.providerID}/${m.modelID}`} className={`menu-item ${chat.modelItem}`} onSelect={() => onModel(m)}>
                        <span className={chat.modelText}>
                          <span className={chat.modelName}>{m.label}</span>
                          <span className={chat.modelDesc}>{m.provider}</span>
                        </span>
                        {model?.modelID === m.modelID && model.providerID === m.providerID && <Check size={16} />}
                      </Menu.Item>
                    ))}
                  </Menu.Content>
                </Menu.Portal>
              </Menu.Root>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
