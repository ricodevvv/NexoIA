"use client";

import { ArrowDown, PanelLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyEvent } from "@/lib/ai/parts";
import type { ChatStreamEvent, Effort, MessagePart } from "@/lib/ai/types";
import { notifyConversationsChanged } from "../events";
import { useShell } from "../shell";
import { useStoredState } from "../use-stored-state";
import { Composer } from "./composer";
import { Message, type UIMessage } from "./message";
import type { ModelOption } from "./model-picker";
import styles from "./chat.module.css";

type Props = {
  conversationId?: string;
  title?: string;
  initialMessages: UIMessage[];
  initialModel: string;
  models: ModelOption[];
  userName: string;
  plan: "free" | "pro";
};

type SendArgs = {
  text: string;
  attachmentIds: string[];
  attachmentParts?: MessagePart[];
  regenerate?: boolean;
  editMessageId?: string;
};

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches";
  if (h < 13) return "Buenos días";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}

/**
 * Pantalla de chat: lista de mensajes, streaming de respuestas y composer.
 */
export function Chat(props: Props) {
  const { models } = props;
  const router = useRouter();
  const { collapsed, toggle } = useShell();
  const [conversationId, setConversationId] = useState(props.conversationId);
  const [title, setTitle] = useState(props.title);
  const [messages, setMessages] = useState<UIMessage[]>(props.initialMessages);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [chosenModel, setChosenModel] = useState<string | null>(null);
  const [storedModel, setStoredModel] = useStoredState<string>("nexo-model", "");
  const [effort, setEffort] = useStoredState<Effort>("nexo-effort", "medium");
  const [web, setWeb] = useStoredState<"on" | "off">("nexo-web", "off");
  const webSearch = web === "on";
  const model =
    chosenModel ??
    (!props.conversationId && models.some((m) => m.id === storedModel && m.available) ? storedModel : props.initialModel);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    if (stickRef.current) scrollToBottom();
  }, [messages, scrollToBottom]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stickRef.current = near;
    setAtBottom(near);
  }

  function updateMessage(id: string, fn: (m: UIMessage) => UIMessage) {
    setMessages((all) => all.map((m) => (m.id === id ? fn(m) : m)));
  }

  async function send({ text, attachmentIds, attachmentParts = [], regenerate, editMessageId }: SendArgs) {
    const userTmp = `tmp-u-${crypto.randomUUID()}`;
    const assistantTmp = `tmp-a-${crypto.randomUUID()}`;
    let assistantId = assistantTmp;
    let createdId: string | null = null;

    setMessages((all) => {
      let base = all;
      if (editMessageId) base = all.slice(0, all.findIndex((m) => m.id === editMessageId));
      if (regenerate) base = all.slice(0, all.findLastIndex((m) => m.role === "user") + 1);
      const next = [...base];
      if (!regenerate) {
        next.push({
          id: userTmp,
          role: "user",
          parts: [...attachmentParts, ...(text.trim() ? [{ type: "text" as const, text }] : [])],
        });
      }
      next.push({ id: assistantTmp, role: "assistant", parts: [], model });
      return next;
    });
    setStreamingId(assistantTmp);
    stickRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    const fail = (message: string) =>
      updateMessage(assistantId, (m) => ({ ...m, parts: [...m.parts, { type: "notice", level: "error", text: message }] }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ conversationId, text, attachmentIds, model, effort, webSearch, regenerate, editMessageId }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        fail(data.error ?? "No se pudo enviar el mensaje.");
        return;
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let queue: ChatStreamEvent[] = [];
      let frame = 0;

      const flush = () => {
        frame = 0;
        const events = queue;
        queue = [];
        if (!events.length) return;
        updateMessage(assistantId, (m) => {
          let parts = m.parts;
          for (const ev of events) {
            if (ev.type === "text" || ev.type === "reasoning" || ev.type === "tool_call" || ev.type === "tool_result" || ev.type === "notice") {
              parts = applyEvent(parts, ev);
            }
          }
          return { ...m, parts };
        });
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ChatStreamEvent;
          if (event.type === "start") {
            if (!conversationId) {
              createdId = event.conversationId;
              setConversationId(event.conversationId);
              window.history.replaceState(null, "", `/chat/${event.conversationId}`);
            }
            const realAssistant = event.assistantMessageId;
            setMessages((all) =>
              all.map((m) =>
                m.id === userTmp ? { ...m, id: event.userMessageId } : m.id === assistantTmp ? { ...m, id: realAssistant } : m,
              ),
            );
            assistantId = realAssistant;
            setStreamingId(realAssistant);
          } else if (event.type === "title") {
            setTitle(event.title);
            notifyConversationsChanged();
          } else if (event.type === "error") {
            fail(event.message);
          } else if (event.type !== "done") {
            queue.push(event);
            if (!frame) frame = requestAnimationFrame(flush);
          }
        }
      }
      if (frame) cancelAnimationFrame(frame);
      flush();
    } catch (err) {
      if ((err as Error).name !== "AbortError") fail("Se perdió la conexión con el servidor.");
    } finally {
      abortRef.current = null;
      setStreamingId(null);
      notifyConversationsChanged();
      if (createdId) router.replace(`/chat/${createdId}`, { scroll: false });
    }
  }

  function changeModel(id: string) {
    setChosenModel(id);
    setStoredModel(id);
  }

  const busy = streamingId !== null;
  const empty = messages.length === 0;
  const labels = new Map(models.map((m) => [m.id, m.label]));
  const firstName = props.userName.split(" ")[0];

  const composer = (
    <Composer
      models={models}
      model={model}
      plan={props.plan}
      effort={effort}
      webSearch={webSearch}
      busy={busy}
      autoFocus
      onModel={changeModel}
      onEffort={setEffort}
      onWebSearch={(v) => setWeb(v ? "on" : "off")}
      onSend={(text, attachmentIds) => send({ text, attachmentIds })}
      onStop={() => abortRef.current?.abort()}
    />
  );

  return (
    <div className={styles.chat}>
      <header className={styles.header} data-collapsed={collapsed}>
        <button className={`icon-btn ${styles.menuBtn}`} onClick={toggle} aria-label="Mostrar barra lateral">
          <PanelLeft />
        </button>
        <h1 className={styles.title}>{empty ? "" : title}</h1>
      </header>

      {empty ? (
        <section className={styles.welcome}>
          <p className="label">
            Nexo · {new Date().toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })}
          </p>
          <h2 className={styles.greeting}>
            {greeting()}, <em>{firstName}</em>.
          </h2>
          <div className={styles.welcomeComposer}>{composer}</div>
          {!models.some((m) => m.available) && (
            <p className={styles.setup}>
              No hay ningún proveedor configurado. <Link href="/settings?tab=keys">Agrega una API key</Link> para empezar.
            </p>
          )}
        </section>
      ) : (
        <>
          <div className={styles.scroll} ref={scrollRef} onScroll={onScroll}>
            <div className={styles.thread}>
              {messages.map((m, i) => (
                <Message
                  key={m.id}
                  message={m}
                  live={m.id === streamingId}
                  isLast={i === messages.length - 1}
                  busy={busy}
                  modelLabel={m.model ? labels.get(m.model) ?? m.model : undefined}
                  onRegenerate={() => send({ text: "", attachmentIds: [], regenerate: true })}
                  onEdit={(text) => {
                    const attachmentParts = m.parts.filter((p) => p.type === "attachment");
                    send({
                      text,
                      attachmentIds: attachmentParts.flatMap((p) => (p.type === "attachment" ? [p.attachmentId] : [])),
                      attachmentParts,
                      editMessageId: m.id,
                    });
                  }}
                />
              ))}
            </div>
          </div>
          {!atBottom && (
            <button className={styles.toBottom} onClick={() => scrollToBottom(true)} aria-label="Ir al final">
              <ArrowDown size={16} />
            </button>
          )}
          <div className={styles.dock}>
            {composer}
            <p className={styles.disclaimer}>Los modelos pueden equivocarse. Verifica lo importante.</p>
          </div>
        </>
      )}
    </div>
  );
}
