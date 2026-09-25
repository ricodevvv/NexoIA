"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { BookOpen, Brain, ChevronLeft, ChevronRight, Clock, Dot, FileText, GitBranch, Globe, ListChecks, type LucideIcon, Search, SquareTerminal, Wrench, X } from "lucide-react";
import Image from "next/image";
import { createElement, useContext, useState } from "react";
import type { MessagePart } from "@/lib/ai/types";
import type { ActivityEntry } from "./group-parts";
import { CodeToolBody, codeToolTitle, codeToolVerb, isCodeTool } from "../code/code-tools";
import { FileCard, kindOf } from "./file-card";
import { MessageContext } from "./message-context";
import styles from "./chat.module.css";

type ToolCallPart = Extract<MessagePart, { type: "tool_call" }>;

function firstLine(text: string, max = 90) {
  const line = text.trim().split(/\n|(?<=[.!?])\s/)[0] ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function toolTitle(part: ToolCallPart, running: boolean) {
  const n = part.name;
  const code = isCodeTool(n) ? codeToolTitle(part, running) : null;
  if (code) return code;
  if (n === "run_python") return running ? "Ejecutando código" : part.isError ? "El código falló" : "Ejecutó código";
  if (n === "skill") {
    const name = (part.input as { name?: unknown } | null)?.name;
    return `${running ? "Leyendo" : "Leyó"} el skill ${typeof name === "string" ? name : ""}`.trim();
  }
  if (n === "memory_save") return running ? "Guardando un recuerdo" : "Guardó un recuerdo";
  if (n === "memory_delete") return running ? "Borrando un recuerdo" : "Borró un recuerdo";
  if (n === "conversation_search") return running ? "Buscando en tus chats" : "Buscó en tus chats";
  if (n === "conversation_read") return running ? "Leyendo un chat anterior" : "Leyó un chat anterior";
  const [server, ...rest] = n.split("__");
  const label = rest.length ? `${server} · ${rest.join("__")}` : n;
  return `${running ? "Usando" : part.isError ? "Falló" : "Usó"} ${label}`;
}

function webTitle(calls: ToolCallPart[], running: boolean) {
  const searches = calls.filter((c) => c.name === "web_search").length;
  const reads = calls.length - searches;
  const detail = [searches ? `${searches} ${searches === 1 ? "búsqueda" : "búsquedas"}` : "", reads ? `${reads} ${reads === 1 ? "página" : "páginas"}` : ""]
    .filter(Boolean)
    .join(" · ");
  return `${running ? "Buscando en la web" : "Buscó en la web"}${detail ? ` · ${detail}` : ""}`;
}

function entryTitle(entry: ActivityEntry, live: boolean) {
  if (entry.kind === "reasoning") return entry.text.trim() ? firstLine(entry.text) : live ? "Pensando…" : "Pensó";
  if (entry.kind === "web") return webTitle(entry.calls, live && entry.calls.some((c) => c.output === undefined));
  return toolTitle(entry.part, live && entry.part.output === undefined);
}

function pretty(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function clean(output: string) {
  return output
    .replace(/\n*\(\d+(\.\d+)? s\)\s*$/, "")
    .replace(/\n*archivos entregados al usuario[^\n]*/, "")
    .trim();
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function EntryBody({ entry }: { entry: ActivityEntry }) {
  if (entry.kind === "reasoning") return <p className={styles.rowText}>{entry.text.trim() || "El modelo razonó sin mostrar el detalle."}</p>;
  if (entry.kind === "web") {
    return (
      <ol className={styles.webList}>
        {entry.calls.map((c) => {
          const input = (c.input ?? {}) as { query?: string; url?: string };
          return (
            <li key={c.id} data-error={c.isError || undefined}>
              {c.name === "web_fetch" && input.url ? (
                <a href={input.url} target="_blank" rel="noopener noreferrer">
                  {hostOf(input.url)}
                </a>
              ) : (
                <span>“{input.query ?? "…"}”</span>
              )}
            </li>
          );
        })}
      </ol>
    );
  }
  const part = entry.part;
  if (isCodeTool(part.name)) return <CodeToolBody part={part} />;
  const isCode = part.name === "run_python";
  const code = isCode ? ((part.input as { code?: string } | null)?.code ?? "") : pretty(part.input);
  return (
    <div className={styles.rowDetail}>
      <p className={styles.rowLabel}>{isCode ? "python" : "Entrada"}</p>
      <pre className={isCode ? styles.cmd : undefined}>{code}</pre>
      {part.output !== undefined && (
        <>
          <p className={styles.rowLabel}>{isCode ? "Salida" : "Resultado"}</p>
          <pre>{(isCode ? clean(part.output) : part.output).slice(0, 8000) || "(sin salida)"}</pre>
        </>
      )}
    </div>
  );
}

function Outputs({ entries }: { entries: ActivityEntry[] }) {
  const ctx = useContext(MessageContext);
  const files = entries.flatMap((e) => (e.kind === "tool" && e.part.files ? e.part.files : []));
  if (!files.length) return null;
  const images = files.filter((f) => f.mediaType.startsWith("image/") && f.mediaType !== "image/svg+xml");
  const others = files.filter((f) => !images.includes(f));
  return (
    <>
      {images.map((f) => (
        <a key={f.attachmentId} href={ctx.attachmentUrl(f.attachmentId)} target="_blank" rel="noopener noreferrer" className={styles.figure}>
          <Image src={ctx.attachmentUrl(f.attachmentId)} alt={f.name} width={720} height={480} unoptimized />
        </a>
      ))}
      {others.map((f) => (
        <FileCard
          key={f.attachmentId}
          title={f.name.replace(/\.[^.]+$/, "")}
          meta={`Archivo · ${f.name.split(".").pop()?.toUpperCase()}`}
          kind={kindOf(f.name)}
          href={ctx.attachmentUrl(f.attachmentId)}
          fileName={f.name}
        />
      ))}
    </>
  );
}

function summaryVerb(entry: ActivityEntry) {
  if (entry.kind === "web") return entry.calls.some((c) => c.name === "web_search") ? "buscó en la web" : "leyó páginas web";
  if (entry.kind === "reasoning") return null;
  const n = entry.part.name;
  if (n === "run_python") return "ejecutó código";
  if (n === "skill") return "leyó un skill";
  if (n.startsWith("memory_")) return "actualizó su memoria";
  if (n.startsWith("conversation_")) return "revisó chats anteriores";
  if (n === "artifact") return "creó un archivo";
  const code = isCodeTool(n) ? codeToolVerb(n) : null;
  if (code) return code;
  const [server, ...rest] = n.split("__");
  return `usó ${rest.length ? `${server} · ${rest.join("__")}` : n}`;
}

/**
 * Resumen de una línea de lo que hizo el agente, estilo "Ejecutó código,
 * buscó en la web". Si solo razonó, usa la primera frase del razonamiento.
 */
export function activitySummary(entries: ActivityEntry[]) {
  const tools = entries.flatMap((e) => (e.kind === "tool" ? [e.part.name] : []));
  const count = (names: string[]) => tools.filter((n) => names.includes(n)).length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const counted: [number, string][] = [
    [count(["write"]), `creó ${plural(count(["write"]), "archivo", "archivos")}`],
    [count(["edit", "multiedit", "patch", "apply_patch"]), `editó ${plural(count(["edit", "multiedit", "patch", "apply_patch"]), "archivo", "archivos")}`],
    [count(["bash"]), `ejecutó ${plural(count(["bash"]), "comando", "comandos")}`],
  ];
  const skip = new Set(["write", "edit", "multiedit", "patch", "apply_patch", "bash"]);
  const verbs = [
    ...counted.filter(([n]) => n > 0).map(([, v]) => v),
    ...new Set(entries.filter((e) => e.kind !== "tool" || !skip.has(e.part.name)).map(summaryVerb).filter((v): v is string => Boolean(v))),
  ];
  if (!verbs.length) {
    const reasoning = entries.find((e) => e.kind === "reasoning" && e.text.trim());
    return reasoning && reasoning.kind === "reasoning" ? firstLine(reasoning.text) : "Pensó";
  }
  const text = verbs.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function entryIcon(entry: ActivityEntry, timeline = false): LucideIcon {
  if (entry.kind === "reasoning") return timeline ? Dot : Clock;
  if (entry.kind === "web") return Globe;
  const n = entry.part.name;
  if (n === "bash" || n === "run_python") return SquareTerminal;
  if (["read", "write", "edit", "multiedit", "patch", "apply_patch", "artifact"].includes(n)) return FileText;
  if (["glob", "grep", "list", "ls", "conversation_search", "conversation_read"].includes(n)) return Search;
  if (n.startsWith("memory_")) return Brain;
  if (n === "skill") return BookOpen;
  if (n.startsWith("todo")) return ListChecks;
  if (n === "task") return GitBranch;
  return Wrench;
}

function isRunning(entry: ActivityEntry, live: boolean) {
  if (!live) return false;
  if (entry.kind === "reasoning") return false;
  if (entry.kind === "web") return entry.calls.some((c) => c.output === undefined);
  return entry.part.output === undefined;
}

function hasDetail(entry: ActivityEntry) {
  if (entry.kind === "reasoning") return entry.text.trim().length > 0;
  return true;
}

function Spinner() {
  return (
    <span className={styles.spinner} role="status" aria-label="Trabajando">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeDasharray="3 4.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/**
 * Lo que se ve mientras el agente arranca y todavía no hay pasos: el
 * indicador de trabajo y "Pensando…" con brillo.
 */
export function ThinkingLine() {
  return (
    <div className={styles.thinkingLine} role="status">
      <Spinner />
      <span className={styles.shimmer}>Pensando…</span>
    </div>
  );
}

function Timeline({ entries, live, onPick }: { entries: ActivityEntry[]; live: boolean; onPick: (e: ActivityEntry) => void }) {
  return (
    <ol className={styles.timeline}>
      {entries.map((entry, i) => {
        const running = isRunning(entry, live) || (live && i === entries.length - 1 && entry.kind === "reasoning");
        const title = entryTitle(entry, running);
        const content = (
          <>
            <span className={styles.tlIcon} data-kind={entry.kind === "reasoning" ? "dot" : undefined} aria-hidden="true">
              {createElement(entryIcon(entry, true), { size: entry.kind === "reasoning" ? 20 : 17 })}
            </span>
            <span className={`${styles.tlTitle} ${running ? styles.shimmer : ""}`}>{title}</span>
            {hasDetail(entry) && <ChevronRight size={16} aria-hidden="true" className={styles.tlChevron} />}
          </>
        );
        return (
          <li key={entry.index}>
            {hasDetail(entry) ? (
              <button type="button" className={styles.tlRow} onClick={() => onPick(entry)}>
                {content}
              </button>
            ) : (
              <div className={styles.tlRow}>{content}</div>
            )}
          </li>
        );
      })}
      {live && (
        <li>
          <div className={styles.tlRow}>
            <span className={styles.tlIcon} data-kind="dot" aria-hidden="true">
              <Dot size={20} />
            </span>
            <span className={`${styles.tlTitle} ${styles.shimmer}`}>Pensando…</span>
          </div>
        </li>
      )}
    </ol>
  );
}

/**
 * Lo que hizo el agente entre textos, en una sola línea: mientras trabaja
 * muestra el paso actual con un brillo que lo recorre; al terminar, un
 * resumen. Al tocarla se abre el "Resumen" con todos los pasos de la
 * respuesta (`timeline`) y el detalle de cada uno.
 */
export function ActivityBox({
  entries,
  live,
  timeline = entries,
  timelineLive = live,
}: {
  entries: ActivityEntry[];
  live: boolean;
  timeline?: ActivityEntry[];
  timelineLive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const current = entries.at(-1);
  if (!current) return null;

  const lastTool = [...entries].reverse().find((e) => e.kind !== "reasoning");
  const lineEntry = live ? current : (lastTool ?? current);
  const running = live && (isRunning(current, live) || current.kind === "reasoning");
  const title = live ? entryTitle(current, true) : activitySummary(entries);
  const detail = picked === null ? null : timeline.find((e) => e.index === picked);

  return (
    <div className={styles.activity}>
      <button
        type="button"
        className={styles.line}
        data-reasoning={!lastTool || undefined}
        onClick={() => {
          setPicked(null);
          setOpen(true);
        }}
      >
        {createElement(entryIcon(lineEntry), { size: 16, "aria-hidden": true, className: styles.lineIcon })}
        <span className={`${styles.lineTitle} ${running ? styles.shimmer : ""}`}>{title}</span>
        <ChevronRight size={15} aria-hidden="true" className={styles.lineChevron} />
      </button>
      {live && <Spinner />}
      <Outputs entries={entries} />

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.sheetOverlay} />
          <Dialog.Content className={styles.sheet} aria-describedby={undefined}>
            <span className={styles.grabber} aria-hidden="true" />
            <header className={styles.sheetHead}>
              {detail ? (
                <button type="button" className={styles.sheetBtn} onClick={() => setPicked(null)} aria-label="Volver al resumen">
                  <ChevronLeft size={20} />
                </button>
              ) : (
                <Dialog.Close className={styles.sheetBtn} aria-label="Cerrar">
                  <X size={18} />
                </Dialog.Close>
              )}
              <Dialog.Title className={styles.sheetTitle}>{detail ? entryTitle(detail, isRunning(detail, timelineLive)) : "Resumen"}</Dialog.Title>
              <span className={styles.sheetSpacer} />
            </header>
            <div className={styles.sheetBody}>
              {detail ? <EntryBody entry={detail} /> : <Timeline entries={timeline} live={timelineLive} onPick={(e) => setPicked(e.index)} />}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
