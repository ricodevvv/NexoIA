"use client";

import type { MessagePart } from "@/lib/ai/types";
import styles from "./code.module.css";

type ToolCallPart = Extract<MessagePart, { type: "tool_call" }>;
type Input = Record<string, unknown>;

const CODE_TOOLS = new Set(["bash", "read", "write", "edit", "patch", "apply_patch", "multiedit", "glob", "grep", "list", "ls", "webfetch", "todowrite", "todoread", "task", "question"]);

export function isCodeTool(name: string) {
  return CODE_TOOLS.has(name) || name.endsWith("present_files");
}

function str(v: unknown) {
  return typeof v === "string" ? v : "";
}

/**
 * Nombre corto de un archivo a partir de su ruta, para los títulos.
 */
export function baseName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/**
 * Título de una tool de nexocode, en pasado cuando terminó y en gerundio
 * mientras corre.
 */
export function codeToolTitle(part: ToolCallPart, running: boolean) {
  const input = (part.input ?? {}) as Input;
  const file = baseName(str(input.filePath) || str(input.path));
  const pick = (now: string, done: string, failed = `Falló: ${done.charAt(0).toLowerCase()}${done.slice(1)}`) =>
    running ? now : part.isError ? failed : done;
  if (part.name.endsWith("present_files")) {
    const names = part.files?.map((f) => f.name) ?? [];
    return pick("Preparando archivos para ti", names.length ? `Te compartió ${names.join(", ")}` : "Te compartió archivos", "No se pudieron compartir los archivos");
  }
  switch (part.name) {
    case "bash":
      return pick(str(input.description) || "Ejecutando un comando", str(input.description) || "Ejecutó un comando", "El comando falló");
    case "read":
      return pick(`Leyendo ${file}`, `Leyó ${file}`);
    case "write":
      return pick(`Creando ${file}`, `Se creó ${file}`, `No se pudo crear ${file}`);
    case "edit":
    case "multiedit":
      return pick(`Editando ${file}`, `Se editó ${file}`, `No se pudo editar ${file}`);
    case "patch":
    case "apply_patch":
      return pick("Aplicando cambios", "Aplicó cambios");
    case "glob":
    case "list":
    case "ls":
      return pick("Buscando archivos", "Buscó archivos");
    case "grep":
      return pick(`Buscando “${str(input.pattern)}”`, `Buscó “${str(input.pattern)}”`);
    case "webfetch":
      return pick("Leyendo una página", "Leyó una página web");
    case "todowrite":
    case "todoread":
      return pick("Actualizando la lista de tareas", "Actualizó la lista de tareas");
    case "task":
      return pick(`Delegando: ${str(input.description)}`, `Delegó: ${str(input.description)}`);
    default:
      return null;
  }
}

/**
 * Verbo para el resumen de una línea cuando la actividad ya terminó.
 */
export function codeToolVerb(name: string) {
  if (name.endsWith("present_files")) return "te compartió archivos";
  if (name === "bash") return "ejecutó comandos";
  if (name === "read") return "leyó archivos";
  if (["write", "edit", "multiedit", "patch", "apply_patch"].includes(name)) return "editó archivos";
  if (["glob", "grep", "list", "ls"].includes(name)) return "buscó en el código";
  if (name === "webfetch") return "leyó páginas web";
  if (name.startsWith("todo")) return "organizó tareas";
  if (name === "task") return "delegó a un subagente";
  return null;
}

/**
 * Pinta un parche unificado con las líneas agregadas en verde y las
 * quitadas en rojo.
 */
export function DiffView({ patch }: { patch: string }) {
  const lines = patch.split("\n").filter((l) => !/^(Index:|={5,}|diff --git|index [0-9a-f])/.test(l));
  return (
    <pre className={styles.diff}>
      {lines.map((line, i) => (
        <span
          key={i}
          data-kind={
            line.startsWith("+++") || line.startsWith("---")
              ? "file"
              : line.startsWith("@@")
                ? "hunk"
                : line.startsWith("+")
                  ? "add"
                  : line.startsWith("-")
                    ? "del"
                    : undefined
          }
        >
          {line || " "}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

function inlineDiff(oldText: string, newText: string) {
  return [...oldText.split("\n").map((l) => `-${l}`), ...newText.split("\n").map((l) => `+${l}`)].join("\n");
}

type Todo = { content: string; status: string };

/**
 * Detalle de una tool de nexocode dentro de la caja de actividad.
 */
export function CodeToolBody({ part }: { part: ToolCallPart }) {
  const input = (part.input ?? {}) as Input;
  const output = part.output ?? "";
  const clip = (t: string, n = 8000) => (t.length > n ? `${t.slice(0, n)}\n…` : t);

  if (part.name === "bash") {
    return (
      <div className={styles.toolBody}>
        <p className={styles.label}>bash</p>
        <pre className={styles.command}>{str(input.command)}</pre>
        {part.output !== undefined && (
          <>
            <p className={styles.label}>Salida</p>
            <pre className={styles.output}>{clip(output) || "(sin salida)"}</pre>
          </>
        )}
      </div>
    );
  }
  if (part.name === "edit" || part.name === "multiedit" || part.name === "patch" || part.name === "apply_patch") {
    const patch = part.diff || (part.name === "edit" ? inlineDiff(str(input.oldString), str(input.newString)) : str(input.patchText) || output);
    return (
      <div className={styles.toolBody}>
        <p className={styles.label}>{str(input.filePath) || "Cambios"}</p>
        <DiffView patch={clip(patch, 40_000)} />
      </div>
    );
  }
  if (part.name === "write") {
    return (
      <div className={styles.toolBody}>
        <p className={styles.label}>{str(input.filePath)}</p>
        <DiffView patch={clip(str(input.content), 40_000).split("\n").map((l) => `+${l}`).join("\n")} />
      </div>
    );
  }
  if (part.name === "todowrite" && Array.isArray(input.todos)) {
    return (
      <ul className={styles.todos}>
        {(input.todos as Todo[]).map((t, i) => (
          <li key={i} data-status={t.status}>
            <span aria-hidden="true" />
            {t.content}
          </li>
        ))}
      </ul>
    );
  }
  const detail = str(input.filePath) || str(input.pattern) || str(input.url) || str(input.prompt) || str(input.path);
  return (
    <div className={styles.toolBody}>
      {detail && <p className={styles.label}>{detail}</p>}
      {part.output !== undefined && <pre className={styles.output}>{clip(output) || "(sin salida)"}</pre>}
    </div>
  );
}
