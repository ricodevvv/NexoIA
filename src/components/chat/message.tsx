"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, FileText, Pencil, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import Image from "next/image";
import { useContext, useState, useSyncExternalStore } from "react";
import type { MessagePart } from "@/lib/ai/types";
import { fileName, readArtifact } from "../artifacts/artifacts";
import { Widget } from "../widgets/widget";
import { ActivityBox, ThinkingLine } from "./activity";
import { CopyButton } from "./code-block";
import { FileCard } from "./file-card";
import { groupParts } from "./group-parts";
import { Markdown } from "./markdown";
import { MessageContext } from "./message-context";
import { SpeakButton } from "./speak-button";
import styles from "./chat.module.css";

export { MessageContext, type MessageContextValue } from "./message-context";

export type Feedback = "up" | "down" | null;

export type UIMessage = {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  model?: string | null;
  createdAt?: string;
  feedback?: Feedback;
  siblings?: { index: number; total: number; ids: string[] };
};

type ToolCallPart = Extract<MessagePart, { type: "tool_call" }>;

function subscribeMinute(cb: () => void) {
  const timer = setInterval(cb, 30_000);
  return () => clearInterval(timer);
}

function minuteNow() {
  return Math.floor(Date.now() / 30_000) * 30_000;
}

/**
 * Hora relativa corta al estilo "ahora", "hace 5 min", "ayer".
 */
export function relativeTime(iso: string, now: number) {
  const diff = Math.max(0, now - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 172800) return "ayer";
  return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short" });
}

function TimeAgo({ iso, title }: { iso?: string; title?: string }) {
  const now = useSyncExternalStore(subscribeMinute, minuteNow, () => 0);
  if (!iso || !now) return null;
  return (
    <time className={styles.time} dateTime={iso} title={[title, new Date(iso).toLocaleString("es")].filter(Boolean).join(" · ")}>
      {relativeTime(iso, now)}
    </time>
  );
}

function BranchSwitcher({ message, disabled, onSwitch }: { message: UIMessage; disabled: boolean; onSwitch?: (id: string) => void }) {
  const s = message.siblings;
  if (!s || !onSwitch) return null;
  return (
    <span className={styles.branch} role="group" aria-label="Versiones">
      <button className="icon-btn" disabled={disabled || s.index === 0} onClick={() => onSwitch(s.ids[s.index - 1])} aria-label="Versión anterior">
        <ChevronLeft />
      </button>
      <span className={styles.branchCount}>
        {s.index + 1}/{s.total}
      </span>
      <button
        className="icon-btn"
        disabled={disabled || s.index === s.total - 1}
        onClick={() => onSwitch(s.ids[s.index + 1])}
        aria-label="Versión siguiente"
      >
        <ChevronRight />
      </button>
    </span>
  );
}

function ArtifactCard({ part }: { part: ToolCallPart }) {
  const ctx = useContext(MessageContext);
  const artifact = readArtifact(part);
  if (!artifact) return <ActivityBox entries={[{ kind: "tool", part, index: 0 }]} live={false} />;
  const version = ctx.artifactVersion?.(artifact.identifier, artifact.callId);
  const name = fileName(artifact);
  const ext = name.split(".").pop()!.toUpperCase();
  const kind = artifact.type === "markdown" ? "doc" : "code";
  const label = artifact.type === "code" || artifact.type === "react" ? "Código" : artifact.type === "markdown" ? "Documento" : "Artifact";
  const download = () => {
    const blob = new Blob([artifact.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <FileCard
      title={artifact.title}
      meta={`${label} · ${ext}${version && version.total > 1 ? ` · versión ${version.index + 1}` : ""}`}
      kind={kind}
      active={ctx.activeArtifactCall === artifact.callId}
      onOpen={() => ctx.openArtifact?.(artifact.identifier, artifact.callId)}
      onDownload={download}
    />
  );
}

function plainText(parts: MessagePart[]) {
  return parts
    .filter((p): p is Extract<MessagePart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function Attachment({ part }: { part: Extract<MessagePart, { type: "attachment" }> }) {
  const src = useContext(MessageContext).attachmentUrl(part.attachmentId);
  if (part.mediaType.startsWith("image/")) {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" className={styles.thumb}>
        <Image src={src} alt={part.name} width={120} height={120} unoptimized />
      </a>
    );
  }
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className={styles.fileChip}>
      <FileText size={14} aria-hidden="true" />
      <span>{part.name}</span>
    </a>
  );
}

function FeedbackButtons({ message, onFeedback }: { message: UIMessage; onFeedback?: (value: Feedback) => void }) {
  if (!onFeedback || message.id.startsWith("tmp-")) return null;
  const value = message.feedback ?? null;
  return (
    <>
      <button
        className="icon-btn"
        aria-label="Buena respuesta"
        aria-pressed={value === "up"}
        title="Buena respuesta"
        onClick={() => onFeedback(value === "up" ? null : "up")}
      >
        <ThumbsUp fill={value === "up" ? "currentColor" : "none"} />
      </button>
      <button
        className="icon-btn"
        aria-label="Mala respuesta"
        aria-pressed={value === "down"}
        title="Mala respuesta"
        onClick={() => onFeedback(value === "down" ? null : "down")}
      >
        <ThumbsDown fill={value === "down" ? "currentColor" : "none"} />
      </button>
    </>
  );
}

type Props = {
  message: UIMessage;
  live: boolean;
  isLast: boolean;
  busy: boolean;
  modelLabel?: string;
  onRegenerate?: () => void;
  onEdit?: (text: string) => void;
  onSwitch?: (id: string) => void;
  onFeedback?: (value: Feedback) => void;
};

/**
 * Pinta un mensaje del chat: la burbuja del usuario con su hora y acciones, o
 * la respuesta con su texto, la caja de actividad del agente, los artifacts
 * y la barra de acciones.
 */
export function Message({ message, live, isLast, busy, modelLabel, onRegenerate, onEdit, onSwitch, onFeedback }: Props) {
  const [editing, setEditing] = useState(false);
  const text = plainText(message.parts);

  if (message.role === "user") {
    const attachments = message.parts.filter((p) => p.type === "attachment");
    return (
      <article className={styles.user} aria-label="Tu mensaje">
        {attachments.length > 0 && (
          <div className={styles.attachments}>
            {attachments.map((p) => p.type === "attachment" && <Attachment key={p.attachmentId} part={p} />)}
          </div>
        )}
        {editing ? (
          <EditBox
            initial={text}
            onCancel={() => setEditing(false)}
            onSave={(value) => {
              setEditing(false);
              onEdit?.(value);
            }}
          />
        ) : (
          text && <div className={styles.userBubble}>{text}</div>
        )}
        {!editing && (
          <div className={styles.userMeta}>
            <BranchSwitcher message={message} disabled={busy} onSwitch={onSwitch} />
            <TimeAgo iso={message.createdAt} />
            {onEdit && !busy && !message.id.startsWith("tmp-") && (
              <button className="icon-btn" aria-label="Editar mensaje" title="Editar" onClick={() => setEditing(true)}>
                <Pencil />
              </button>
            )}
            {text && <CopyButton text={text} />}
          </div>
        )}
      </article>
    );
  }

  const items = groupParts(message.parts);
  const timeline = items.flatMap((item) => (item.kind === "activity" ? item.entries : []));
  const lastItem = items.at(-1);
  const waiting = live && (!lastItem || (lastItem.kind === "part" && lastItem.part.type === "tool_call"));

  return (
    <article className={styles.assistant} aria-label="Respuesta" aria-busy={live}>
      {items.map((item) => {
        if (item.kind === "activity") {
          return (
            <ActivityBox key={`a-${item.index}`} entries={item.entries} live={live && item === lastItem} timeline={timeline} timelineLive={live} />
          );
        }
        const { part, index: i } = item;
        if (part.type === "text") return <Markdown key={i} text={part.text} />;
        if (part.type === "tool_call" && part.name === "artifact") {
          if (part.output === undefined) {
            return <ActivityBox key={part.id} entries={[{ kind: "tool", part, index: i }]} live={live} />;
          }
          return <ArtifactCard key={part.id} part={part} />;
        }
        if (part.type === "tool_call" && part.name === "show_widget") {
          return <Widget key={part.id} input={part.input} pending={live && part.output === undefined} />;
        }
        if (part.type === "notice") {
          return (
            <div key={i} className={styles.notice} data-level={part.level} role={part.level === "error" ? "alert" : "status"}>
              <AlertTriangle size={15} aria-hidden="true" />
              <span>{part.text}</span>
            </div>
          );
        }
        return null;
      })}
      {waiting && (
        <ThinkingLine />
      )}
      {!live && (
        <div className={styles.actions}>
          <BranchSwitcher message={message} disabled={busy} onSwitch={onSwitch} />
          {text && <CopyButton text={text} />}
          <SpeakButton text={text} />
          <FeedbackButtons message={message} onFeedback={onFeedback} />
          {isLast && onRegenerate && !busy && (
            <button className="icon-btn" aria-label="Regenerar respuesta" title="Regenerar" onClick={onRegenerate}>
              <RefreshCw />
            </button>
          )}
          <TimeAgo iso={message.createdAt} title={modelLabel} />
        </div>
      )}
    </article>
  );
}

function EditBox({ initial, onSave, onCancel }: { initial: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  return (
    <div className={styles.editBox}>
      <textarea
        className="textarea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        rows={Math.min(12, Math.max(3, value.split("\n").length))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && value.trim()) {
            e.preventDefault();
            onSave(value);
          }
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className={styles.editActions}>
        <button className="btn btn-sm" onClick={onCancel}>
          Cancelar
        </button>
        <button className="btn btn-sm btn-primary" disabled={!value.trim()} onClick={() => onSave(value)}>
          Enviar
        </button>
      </div>
    </div>
  );
}
