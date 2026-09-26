"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { BookOpen, Brain, ChevronLeft, ChevronRight, Clock, Dot, FileText, GitBranch, Globe, ListChecks, type LucideIcon, Search, SquareTerminal, Wrench, X } from "lucide-react";
import Image from "next/image";
import { createElement, useContext, useState } from "react";
import type { MessagePart } from "@/lib/ai/types";
import type { ActivityEntry } from "./group-parts";
import { CodeToolBody, codeToolTitle, codeToolVerb, isCodeTool } from "../code/code-tools";
import { FileCard, kindOf } from "./file-card";
import { useDragToClose } from "../use-drag-to-close";
import { MessageContext } from "./message-context";
import styles from "./chat.module.css";

type ToolCallPart = Extract<MessagePart, { type: "tool_call" }>;

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
  if (entry.kind === "reasoning") return live ? "Pensando…" : "Pensó";
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
  if (entry.kind === "reasoning") return null;
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
 * Si el comando hace `git push`, devuelve la rama a la que subió (o "" si no
 * la dice); si no es un push, nada.
 */
function pushTarget(input: unknown): string[] {
  const command = (input as { command?: unknown } | null)?.command;
  if (typeof command !== "string") return [];
  const match = command.match(/\bgit\s+push\b([^;&|\n]*)/);
  if (!match) return [];
  const args = match[1].trim().split(/\s+/).filter((a) => a && !a.startsWith("-"));
  const ref = args.length > 1 ? args.at(-1)! : "";
  return [ref.split(":").at(-1) ?? ""];
}

/**
 * Cuántas líneas agregó y quitó el agente en esta actividad, sumando los
 * diffs de sus ediciones y las líneas de los archivos que creó.
 */
export function diffStats(entries: ActivityEntry[]) {
  let added = 0;
  let removed = 0;
  for (const e of entries) {
    if (e.kind !== "tool" || e.part.isError) continue;
    if (e.part.diff) {
      for (const line of e.part.diff.split("\n")) {
        if (line.startsWith("+") && !line.startsWith("+++")) added++;
        else if (line.startsWith("-") && !line.startsWith("---")) removed++;
      }
    } else if (e.part.name === "write") {
      const content = (e.part.input as { content?: unknown } | null)?.content;
      if (typeof content === "string" && content) added += content.split("\n").length;
    }
  }
  return { added, removed };
}

/**
 * Resumen de una línea de lo que hizo el agente, estilo "Ejecutó código,
 * buscó en la web". Si solo razonó, dice "Pensó" sin mostrar el razonamiento.
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
  const pushed = entries.flatMap((e) => (e.kind === "tool" && e.part.name === "bash" && !e.part.isError ? pushTarget(e.part.input) : []));
  const verbs = [
    ...counted.filter(([n]) => n > 0).map(([, v]) => v),
    ...new Set(entries.filter((e) => e.kind !== "tool" || !skip.has(e.part.name)).map(summaryVerb).filter((v): v is string => Boolean(v))),
    ...new Set(pushed.map((branch) => (branch ? `envió a ${branch}` : "subió los cambios"))),
  ];
  if (!verbs.length) return "Pensó";
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
  if (entry.kind === "reasoning") return false;
  if (entry.kind === "tool" && entry.part.name === "skill") return false;
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
  const [dir, setDir] = useState<"forward" | "back">("forward");
  const { sheetRef, handleProps } = useDragToClose<HTMLDivElement>(() => setOpen(false));
  const current = entries.at(-1);
  if (!current) return null;

  const lastTool = [...entries].reverse().find((e) => e.kind !== "reasoning");
  const lineEntry = live ? current : (lastTool ?? current);
  const running = live && (isRunning(current, live) || current.kind === "reasoning");
  const title = live ? entryTitle(current, true) : activitySummary(entries);
  const stats = diffStats(entries);
  const detail = picked === null ? null : timeline.find((e) => e.index === picked);

  return (
    <div className={styles.activity}>
      <button
        type="button"
        className={styles.line}
        data-reasoning={!lastTool || undefined}
        onClick={() => {
          setPicked(null);
          setDir("forward");
          setOpen(true);
        }}
      >
        {createElement(entryIcon(lineEntry), { size: 16, "aria-hidden": true, className: styles.lineIcon })}
        <span className={`${styles.lineTitle} ${running ? styles.shimmer : ""}`}>{title}</span>
        {!live && (stats.added > 0 || stats.removed > 0) && (
          <span className={styles.lineDiff} aria-label={`${stats.added} líneas agregadas, ${stats.removed} quitadas`}>
            <span data-sign="add">+{stats.added}</span>
            <span data-sign="del">-{stats.removed}</span>
          </span>
        )}
        <ChevronRight size={15} aria-hidden="true" className={styles.lineChevron} />
      </button>
      {live && <Spinner />}
      <Outputs entries={entries} />

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.sheetOverlay} />
          <Dialog.Content ref={sheetRef} className={styles.sheet} aria-describedby={undefined}>
            <div className={styles.dragZone} {...handleProps}>
              <span className={styles.grabber} aria-hidden="true" />
              <header className={styles.sheetHead}>
                {detail ? (
                  <button
                    type="button"
                    className={styles.sheetBtn}
                    onClick={() => {
                      setDir("back");
                      setPicked(null);
                    }}
                    aria-label="Volver al resumen"
                  >
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
            </div>
            <div className={styles.sheetBody}>
              <div key={detail ? `d${detail.index}` : "summary"} className={styles.sheetPage} data-dir={dir}>
                {detail ? (
                  <EntryBody entry={detail} />
                ) : (
                  <Timeline
                    entries={timeline}
                    live={timelineLive}
                    onPick={(e) => {
                      setDir("forward");
                      setPicked(e.index);
                    }}
                  />
                )}
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
