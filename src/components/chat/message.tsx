"use client";

import { AlertTriangle, Brain, Check, Code2, Download, FileText, Globe, Loader2, Pencil, RefreshCw, Terminal, Wrench, X } from "lucide-react";
import Image from "next/image";
import { createContext, useContext, useState } from "react";
import type { MessagePart } from "@/lib/ai/types";
import { readArtifact } from "../artifacts/artifacts";
import artifactStyles from "../artifacts/artifacts.module.css";
import { CodeBlock, CopyButton } from "./code-block";
import { Markdown } from "./markdown";
import styles from "./chat.module.css";

export type UIMessage = {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  model?: string | null;
};

type ToolCallPart = Extract<MessagePart, { type: "tool_call" }>;

export type MessageContextValue = {
  attachmentUrl: (id: string) => string;
  openArtifact?: (identifier: string, callId: string) => void;
  activeArtifactCall?: string | null;
  artifactVersion?: (identifier: string, callId: string) => { index: number; total: number };
};

export const MessageContext = createContext<MessageContextValue>({
  attachmentUrl: (id) => `/api/attachments/${id}`,
});

function ArtifactCard({ part }: { part: ToolCallPart }) {
  const ctx = useContext(MessageContext);
  const artifact = readArtifact(part);
  if (!artifact) return <ToolCall part={part} live={false} />;
  const version = ctx.artifactVersion?.(artifact.identifier, artifact.callId);
  return (
    <button
      type="button"
      className={artifactStyles.card}
      data-active={ctx.activeArtifactCall === artifact.callId}
      onClick={() => ctx.openArtifact?.(artifact.identifier, artifact.callId)}
    >
      <span className={artifactStyles.cardIcon} aria-hidden="true">
        <Code2 size={17} />
      </span>
      <span className={artifactStyles.cardText}>
        <span className={artifactStyles.cardTitle}>{artifact.title}</span>
        <span className="label">
          {artifact.type}
          {version && version.total > 1 ? ` · versión ${version.index + 1}` : ""} · abrir
        </span>
      </span>
    </button>
  );
}

function plainText(parts: MessagePart[]) {
  return parts
    .filter((p): p is Extract<MessagePart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function toolLabel(name: string) {
  if (name === "web_search") return "Búsqueda web";
  if (name === "memory_save") return "Memoria · guardar";
  if (name === "memory_delete") return "Memoria · borrar";
  const [server, ...rest] = name.split("__");
  return rest.length ? `${server} · ${rest.join("__")}` : name;
}

function pretty(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function stripSections(output: string) {
  return output.replace(/\n*\(\d+(\.\d+)? s\)\s*$/, "").replace(/\n*archivos entregados al usuario[^\n]*/, "").trim();
}

function CodeRun({ part, live }: { part: ToolCallPart; live: boolean }) {
  const ctx = useContext(MessageContext);
  const running = part.output === undefined && live;
  const code = (part.input as { code?: string } | null)?.code ?? "";
  const images = part.files?.filter((f) => f.mediaType.startsWith("image/") && f.mediaType !== "image/svg+xml") ?? [];
  const others = part.files?.filter((f) => !images.includes(f)) ?? [];
  const duration = part.output?.match(/\((\d+(?:\.\d+)?) s\)\s*$/)?.[1];
  return (
    <div className={styles.codeRun} data-state={running ? "running" : part.isError ? "error" : "done"}>
      <details className={styles.tool} data-state={running ? "running" : part.isError ? "error" : "done"}>
        <summary>
          <Terminal size={14} aria-hidden="true" />
          <span className={styles.toolName}>Python</span>
          <span className={styles.toolQuery}>{running ? "ejecutando…" : duration ? `${duration} s` : ""}</span>
          <span className={styles.toolStatus}>
            {running ? (
              <Loader2 size={13} className={styles.spin} aria-label="Ejecutando" />
            ) : part.isError ? (
              <X size={13} aria-label="Falló" />
            ) : (
              <Check size={13} aria-label="Listo" />
            )}
          </span>
        </summary>
        <div className={styles.toolBody}>
          <CodeBlock code={code} lang="python" />
          {part.output !== undefined && (
            <>
              <p className="label">Salida</p>
              <pre>{stripSections(part.output) || "(sin salida)"}</pre>
            </>
          )}
        </div>
      </details>
      {images.map((f) => (
        <a key={f.attachmentId} href={ctx.attachmentUrl(f.attachmentId)} target="_blank" rel="noopener noreferrer" className={styles.figure}>
          <Image src={ctx.attachmentUrl(f.attachmentId)} alt={f.name} width={720} height={480} unoptimized />
        </a>
      ))}
      {others.length > 0 && (
        <div className={styles.runFiles}>
          {others.map((f) => (
            <a key={f.attachmentId} href={ctx.attachmentUrl(f.attachmentId)} download={f.name} className={styles.fileChip}>
              <Download size={14} aria-hidden="true" />
              <span>{f.name}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolCall({ part, live }: { part: ToolCallPart; live: boolean }) {
  const running = part.output === undefined && live;
  const Icon = part.name === "web_search" ? Globe : part.name.startsWith("memory_") ? Brain : Wrench;
  const query = part.name === "web_search" && part.input && typeof part.input === "object" ? (part.input as { query?: string }).query : null;
  return (
    <details className={styles.tool} data-state={running ? "running" : part.isError ? "error" : "done"}>
      <summary>
        <Icon size={14} aria-hidden="true" />
        <span className={styles.toolName}>{toolLabel(part.name)}</span>
        {query && <span className={styles.toolQuery}>“{query}”</span>}
        <span className={styles.toolStatus}>
          {running ? (
            <Loader2 size={13} className={styles.spin} aria-label="Ejecutando" />
          ) : part.isError ? (
            <X size={13} aria-label="Falló" />
          ) : (
            <Check size={13} aria-label="Listo" />
          )}
        </span>
      </summary>
      <div className={styles.toolBody}>
        <p className="label">Entrada</p>
        <pre>{pretty(part.input)}</pre>
        {part.output !== undefined && (
          <>
            <p className="label">Resultado</p>
            <pre>{part.output.length > 6000 ? `${part.output.slice(0, 6000)}\n…` : part.output}</pre>
          </>
        )}
      </div>
    </details>
  );
}

function Reasoning({ text, live }: { text: string; live: boolean }) {
  return (
    <details className={styles.reasoning} data-live={live}>
      <summary>
        <span className={styles.reasoningDot} aria-hidden="true" />
        {live ? "Pensando…" : "Razonamiento"}
      </summary>
      <div className={styles.reasoningBody}>{text || "El modelo razonó sin mostrar el detalle."}</div>
    </details>
  );
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

type Props = {
  message: UIMessage;
  live: boolean;
  isLast: boolean;
  busy: boolean;
  modelLabel?: string;
  onRegenerate?: () => void;
  onEdit?: (text: string) => void;
};

/**
 * Pinta un mensaje del chat con todas sus partes: texto, razonamiento,
 * llamadas a tools, adjuntos y avisos.
 */
export function Message({ message, live, isLast, busy, modelLabel, onRegenerate, onEdit }: Props) {
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
          <div className={styles.actions}>
            {text && <CopyButton text={text} />}
            {onEdit && !busy && !message.id.startsWith("tmp-") && (
              <button className="icon-btn" aria-label="Editar mensaje" title="Editar" onClick={() => setEditing(true)}>
                <Pencil />
              </button>
            )}
          </div>
        )}
      </article>
    );
  }

  const lastIndex = message.parts.length - 1;
  return (
    <article className={styles.assistant} aria-label="Respuesta" aria-busy={live}>
      {message.parts.map((part, i) => {
        const partLive = live && i === lastIndex;
        if (part.type === "text") return <Markdown key={i} text={part.text} />;
        if (part.type === "reasoning") return <Reasoning key={i} text={part.text} live={partLive} />;
        if (part.type === "tool_call" && part.name === "artifact" && part.output !== undefined) {
          return <ArtifactCard key={part.id} part={part} />;
        }
        if (part.type === "tool_call" && part.name === "run_python") return <CodeRun key={part.id} part={part} live={live} />;
        if (part.type === "tool_call") return <ToolCall key={part.id} part={part} live={live} />;
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
      {live && (message.parts.length === 0 || message.parts.at(-1)?.type === "tool_call") && (
        <div className={styles.thinking} role="status">
          <span />
          <span />
          <span />
          <span className="sr-only">Generando respuesta</span>
        </div>
      )}
      {!live && (
        <div className={styles.actions}>
          {text && <CopyButton text={text} />}
          {isLast && onRegenerate && !busy && (
            <button className="icon-btn" aria-label="Regenerar respuesta" title="Regenerar" onClick={onRegenerate}>
              <RefreshCw />
            </button>
          )}
          {modelLabel && <span className="tag">{modelLabel}</span>}
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
