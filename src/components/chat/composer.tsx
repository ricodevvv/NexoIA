"use client";

import { ArrowUp, FileText, Globe, Image as ImageIcon, Loader2, Paperclip, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Effort } from "@/lib/ai/types";
import { ModelPicker, type ModelOption } from "./model-picker";
import styles from "./chat.module.css";

export type PendingFile = {
  key: string;
  name: string;
  mediaType: string;
  id?: string;
  error?: string;
};

type Props = {
  models: ModelOption[];
  model: string;
  plan: "free" | "pro";
  effort: Effort;
  webSearch: boolean;
  busy: boolean;
  autoFocus?: boolean;
  onModel: (id: string) => void;
  onEffort: (e: Effort) => void;
  onWebSearch: (v: boolean) => void;
  onSend: (text: string, attachmentIds: string[]) => void;
  onStop: () => void;
};

const EFFORT_LABEL: Record<Effort, string> = { low: "Rápido", medium: "Equilibrado", high: "A fondo" };

async function upload(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/attachments", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "No se pudo subir");
  return data as { id: string; name: string; mediaType: string };
}

/**
 * Caja de texto para escribir mensajes, con adjuntos, selector de modelo y
 * controles de razonamiento y búsqueda web.
 */
export function Composer(props: Props) {
  const { models, model, busy } = props;
  const [text, setText] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const current = models.find((m) => m.id === model);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
  }, [text]);

  function addFiles(list: FileList | File[]) {
    for (const file of Array.from(list)) {
      const key = `${file.name}-${crypto.randomUUID()}`;
      setFiles((f) => [...f, { key, name: file.name, mediaType: file.type }]);
      upload(file)
        .then((res) => setFiles((f) => f.map((x) => (x.key === key ? { ...x, id: res.id, mediaType: res.mediaType } : x))))
        .catch((err) => setFiles((f) => f.map((x) => (x.key === key ? { ...x, error: err.message } : x))));
    }
  }

  const uploading = files.some((f) => !f.id && !f.error);
  const ready = files.filter((f) => f.id).map((f) => f.id!);
  const canSend = !busy && !uploading && (text.trim().length > 0 || ready.length > 0) && Boolean(current?.available);

  function send() {
    if (!canSend) return;
    props.onSend(text, ready);
    setText("");
    setFiles([]);
  }

  return (
    <div
      className={styles.composer}
      data-dragging={dragging}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      }}
    >
      {files.length > 0 && (
        <ul className={styles.pending}>
          {files.map((f) => (
            <li key={f.key} data-error={Boolean(f.error)} title={f.error ?? f.name}>
              {!f.id && !f.error ? (
                <Loader2 size={13} className={styles.spin} />
              ) : f.mediaType.startsWith("image/") ? (
                <ImageIcon size={13} />
              ) : (
                <FileText size={13} />
              )}
              <span>{f.error ? `${f.name}: ${f.error}` : f.name}</span>
              <button
                type="button"
                aria-label={`Quitar ${f.name}`}
                onClick={() => setFiles((all) => all.filter((x) => x.key !== f.key))}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="sr-only" htmlFor="composer-input">
        Escribe tu mensaje
      </label>
      <textarea
        id="composer-input"
        ref={textareaRef}
        className={styles.input}
        value={text}
        rows={1}
        autoFocus={props.autoFocus}
        placeholder={current?.available ? "Escribe lo que quieras…" : "Configura una API key en Ajustes para usar este modelo"}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          const pasted = Array.from(e.clipboardData.files);
          if (pasted.length) {
            e.preventDefault();
            addFiles(pasted);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
      />

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/*,.md,.json,.csv,.ts,.tsx,.js,.py,.java,.kt,.go,.rs,.yaml,.yml"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button type="button" className="icon-btn" aria-label="Adjuntar archivos" title="Adjuntar" onClick={() => fileRef.current?.click()}>
            <Paperclip />
          </button>
          {current?.webSearch && (
            <button
              type="button"
              className="icon-btn"
              aria-pressed={props.webSearch}
              aria-label="Búsqueda web"
              title={props.webSearch ? "Búsqueda web activada" : "Activar búsqueda web"}
              onClick={() => props.onWebSearch(!props.webSearch)}
            >
              <Globe />
            </button>
          )}
          {current?.reasoning && (
            <label className={styles.effort}>
              <span className="sr-only">Nivel de razonamiento</span>
              <select value={props.effort} onChange={(e) => props.onEffort(e.target.value as Effort)}>
                {(Object.keys(EFFORT_LABEL) as Effort[]).map((e) => (
                  <option key={e} value={e}>
                    {EFFORT_LABEL[e]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className={styles.toolbarRight}>
          <ModelPicker models={models} value={model} plan={props.plan} onChange={props.onModel} />
          {busy ? (
            <button type="button" className={styles.send} data-stop onClick={props.onStop} aria-label="Detener">
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button type="button" className={styles.send} onClick={send} disabled={!canSend} aria-label="Enviar">
              <ArrowUp size={17} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
