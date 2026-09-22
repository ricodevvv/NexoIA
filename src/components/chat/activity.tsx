"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import Image from "next/image";
import { useContext, useEffect, useState } from "react";
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

function Row({ entry, live }: { entry: ActivityEntry; live: boolean }) {
  const [open, setOpen] = useState(false);
  const title = entryTitle(entry, live);
  return (
    <div className={styles.row} data-open={open}>
      <button type="button" className={styles.rowHead} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={styles.rowTitle}>{title}</span>
        {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
      </button>
      {open && <EntryBody entry={entry} />}
    </div>
  );
}

function useElapsed(startedAt: number | undefined, running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : null;
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
  const verbs = [...new Set(entries.map(summaryVerb).filter((v): v is string => Boolean(v)))];
  if (!verbs.length) {
    const reasoning = entries.find((e) => e.kind === "reasoning" && e.text.trim());
    return reasoning && reasoning.kind === "reasoning" ? firstLine(reasoning.text) : "Pensó";
  }
  const text = verbs.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Caja con lo que hizo el agente entre textos: razonamiento, tools y búsquedas.
 * Mientras trabaja, arriba va una línea de estado con lo que está haciendo y
 * cuántos segundos lleva. Al terminar queda como una línea gris que se abre.
 */
export function ActivityBox({ entries, live, startedAt }: { entries: ActivityEntry[]; live: boolean; startedAt?: number }) {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const elapsed = useElapsed(startedAt, live);
  const current = entries.at(-1);

  if (!live) {
    return (
      <div className={styles.activity}>
        <button type="button" className={styles.summary} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className={styles.statusText}>{activitySummary(entries)}</span>
          {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
        </button>
        {open && (
          <div className={styles.activityBox}>
            {entries.map((entry) => (
              <Row key={entry.index} entry={entry} live={false} />
            ))}
          </div>
        )}
        <Outputs entries={entries} />
      </div>
    );
  }

  return (
    <div className={styles.activity}>
      {current && (
        <button type="button" className={styles.status} onClick={() => setCollapsed((v) => !v)} aria-expanded={!collapsed}>
          <span className={styles.dots} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className={styles.statusText}>{entryTitle(current, true)}</span>
          {elapsed !== null && <span className={styles.statusTime}>{elapsed} s</span>}
          <ChevronDown size={14} aria-hidden="true" className={styles.statusChevron} data-collapsed={collapsed} />
        </button>
      )}
      {!collapsed && (
        <div className={styles.activityBox}>
          {entries.map((entry) => (
            <Row key={entry.index} entry={entry} live={live} />
          ))}
        </div>
      )}
      <Outputs entries={entries} />
    </div>
  );
}
