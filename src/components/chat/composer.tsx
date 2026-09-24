"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { ArrowUp, Check, CornerDownLeft, ChevronRight, Feather, FileText, Globe, Image as ImageIcon, Loader2, Mic, Paperclip, Plus, Settings2, Square, Telescope, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Effort } from "@/lib/ai/types";
import type { StyleOption } from "@/lib/styles";
import { ModelPicker, type ModelOption } from "./model-picker";
import { useDictation } from "./use-dictation";
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
  research: boolean;
  onResearch: (v: boolean) => void;
  styles: StyleOption[];
  style: string;
  onStyle: (id: string) => void;
  busy: boolean;
  autoFocus?: boolean;
  initialText?: string;
  replying?: boolean;
  onModel: (id: string) => void;
  onEffort: (e: Effort) => void;
  onWebSearch: (v: boolean) => void;
  onSend: (text: string, attachmentIds: string[]) => void;
  onStop: () => void;
};

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
  const router = useRouter();
  const [text, setText] = useState(props.initialText ?? "");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const current = models.find((m) => m.id === model);
  const baseTextRef = useRef("");
  const dictation = useDictation((spoken) => {
    const base = baseTextRef.current;
    setText(base ? `${base} ${spoken}` : spoken);
  });

  function toggleDictation() {
    if (!dictation.listening) baseTextRef.current = text.trim();
    dictation.toggle();
  }

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
    if (dictation.listening) dictation.toggle();
    props.onSend(text, ready);
    setText("");
    setFiles([]);
  }

  const currentStyle = props.styles.find((st) => st.id === props.style);
  const canSearch = Boolean(current?.webSearch);

  return (
    <div className={styles.composerWrap}>
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
                <button type="button" aria-label={`Quitar ${f.name}`} onClick={() => setFiles((all) => all.filter((x) => x.key !== f.key))}>
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
          placeholder={
            !current?.available
              ? "Configura una API key en Ajustes para usar este modelo"
              : props.research
                ? "¿Qué quieres investigar? Tema, alcance y para qué lo necesitas…"
                : props.replying
                  ? "Responder a Nexo"
                  : "Escribe un mensaje…"
          }
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
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Menu.Root>
              <Menu.Trigger className={styles.plusBtn} aria-label="Adjuntar y herramientas">
                <Plus size={20} strokeWidth={1.75} />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Content className={`menu ${styles.plusMenu}`} side="top" align="start" sideOffset={10}>
                  <Menu.Item className="menu-item" onSelect={() => fileRef.current?.click()}>
                    <Paperclip /> Agregar archivos o fotos
                  </Menu.Item>
                  {canSearch && (
                    <>
                      <Menu.Separator className="menu-sep" />
                      <Menu.CheckboxItem className="menu-item" checked={props.research} onCheckedChange={(v) => props.onResearch(Boolean(v))}>
                        <Telescope /> <span className={styles.grow}>Investigación</span>
                        <Menu.ItemIndicator>
                          <Check size={16} />
                        </Menu.ItemIndicator>
                      </Menu.CheckboxItem>
                      {!props.research && (
                        <Menu.CheckboxItem className="menu-item" checked={props.webSearch} onCheckedChange={(v) => props.onWebSearch(Boolean(v))}>
                          <Globe /> <span className={styles.grow}>Búsqueda web</span>
                          <Menu.ItemIndicator>
                            <Check size={16} />
                          </Menu.ItemIndicator>
                        </Menu.CheckboxItem>
                      )}
                    </>
                  )}
                  <Menu.Separator className="menu-sep" />
                  <Menu.Sub>
                    <Menu.SubTrigger className="menu-item">
                      <Feather /> <span className={styles.grow}>Estilo</span>
                      <span className={styles.menuValue}>{currentStyle?.name ?? "Normal"}</span>
                      <ChevronRight size={16} />
                    </Menu.SubTrigger>
                    <Menu.Portal>
                      <Menu.SubContent className="menu" sideOffset={6}>
                        <Menu.RadioGroup value={props.style} onValueChange={props.onStyle}>
                          {props.styles.map((st) => (
                            <Menu.RadioItem key={st.id} className="menu-item" value={st.id}>
                              <span className={styles.grow}>{st.name}</span>
                              <Menu.ItemIndicator>
                                <Check size={16} />
                              </Menu.ItemIndicator>
                            </Menu.RadioItem>
                          ))}
                        </Menu.RadioGroup>
                        <Menu.Separator className="menu-sep" />
                        <Menu.Item className="menu-item" onSelect={() => router.push("/settings?tab=personalization#estilos")}>
                          <Settings2 /> Crear y editar estilos
                        </Menu.Item>
                      </Menu.SubContent>
                    </Menu.Portal>
                  </Menu.Sub>
                </Menu.Content>
              </Menu.Portal>
            </Menu.Root>

            {props.research && (
              <button type="button" className={styles.chip} data-on onClick={() => props.onResearch(false)} aria-label="Quitar investigación">
                <Telescope size={14} /> Investigación <X size={12} />
              </button>
            )}
            {!props.research && props.webSearch && canSearch && (
              <button type="button" className={styles.chip} data-on onClick={() => props.onWebSearch(false)} aria-label="Quitar búsqueda web">
                <Globe size={14} /> Web <X size={12} />
              </button>
            )}
            {currentStyle && currentStyle.id !== "normal" && (
              <button type="button" className={styles.chip} onClick={() => props.onStyle("normal")} aria-label={`Quitar estilo ${currentStyle.name}`}>
                <Feather size={14} /> {currentStyle.name} <X size={12} />
              </button>
            )}
          </div>

          <div className={styles.toolbarRight}>
            {dictation.supported && (
              <button
                type="button"
                className={`icon-btn ${styles.roundIcon} ${dictation.listening ? styles.listening : ""}`}
                aria-pressed={dictation.listening}
                aria-label={dictation.listening ? "Dejar de dictar" : "Dictar por voz"}
                title={dictation.error ?? (dictation.listening ? "Escuchando… toca para parar" : "Dictar por voz")}
                onClick={toggleDictation}
              >
                <Mic />
              </button>
            )}
            {busy ? (
              <button type="button" className={styles.send} data-stop onClick={props.onStop} aria-label="Detener">
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button type="button" className={styles.send} onClick={send} disabled={!canSend} aria-label="Enviar">
                <ArrowUp size={18} strokeWidth={2.25} className={styles.sendArrow} />
                <CornerDownLeft size={18} className={styles.sendEnter} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={styles.composerFoot}>
        <span className={styles.disclaimer}>Nexo es una IA y puede cometer errores.</span>
        <ModelPicker
          models={models}
          value={model}
          plan={props.plan}
          onChange={props.onModel}
          effort={props.effort}
          onEffort={props.onEffort}
        />
      </div>
    </div>
  );
}
