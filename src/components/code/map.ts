import type { FileRef, MessagePart } from "@/lib/ai/types";
import { clonedRepo, cloneSucceeded, isScriptCommand, scriptSucceeded, type StepStatus } from "@/lib/code-setup";
import type { UIMessage } from "../chat/message";

export type NcPart = {
  id: string;
  messageID: string;
  type: string;
  text?: string;
  synthetic?: boolean;
  ignored?: boolean;
  tool?: string;
  callID?: string;
  state?: {
    status: "pending" | "running" | "completed" | "error";
    input?: Record<string, unknown>;
    output?: string;
    error?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  };
  filename?: string;
  mime?: string;
};

export type NcInfo = {
  id: string;
  role: "user" | "assistant";
  time: { created: number; completed?: number };
  modelID?: string;
  error?: { name: string; data?: { message?: string } };
};

export type NcMessage = { info: NcInfo; parts: NcPart[] };

export type SessionState = { messages: Record<string, { info?: NcInfo; parts: Record<string, NcPart> }> };

export type NcEvent =
  | { type: "message.updated"; properties: { info: NcInfo } }
  | { type: "message.removed"; properties: { messageID: string } }
  | { type: "message.part.updated"; properties: { part: NcPart } }
  | { type: "message.part.delta"; properties: { messageID: string; partID: string; field: string; delta: string } }
  | { type: "message.part.removed"; properties: { messageID: string; partID: string } };

/**
 * Arma el estado inicial de una sesión con los mensajes que devuelve la API.
 */
export function initialState(messages: NcMessage[]): SessionState {
  const state: SessionState = { messages: {} };
  for (const m of messages) state.messages[m.info.id] = { info: m.info, parts: Object.fromEntries(m.parts.map((p) => [p.id, p])) };
  return state;
}

/**
 * Aplica un evento de nexocode al estado de la sesión sin mutarlo.
 */
export function applyNcEvent(state: SessionState, event: NcEvent): SessionState {
  const messages = { ...state.messages };
  const touch = (id: string) => (messages[id] = messages[id] ?? { parts: {} });
  switch (event.type) {
    case "message.updated": {
      const m = touch(event.properties.info.id);
      messages[event.properties.info.id] = { ...m, info: event.properties.info };
      break;
    }
    case "message.removed":
      delete messages[event.properties.messageID];
      break;
    case "message.part.updated": {
      const { part } = event.properties;
      const m = touch(part.messageID);
      messages[part.messageID] = { ...m, parts: { ...m.parts, [part.id]: part } };
      break;
    }
    case "message.part.delta": {
      const { messageID, partID, field, delta } = event.properties;
      const m = touch(messageID);
      const part = m.parts[partID] ?? { id: partID, messageID, type: field === "text" ? "text" : field };
      const current = (part as Record<string, unknown>)[field];
      messages[messageID] = { ...m, parts: { ...m.parts, [partID]: { ...part, [field]: `${typeof current === "string" ? current : ""}${delta}` } } };
      break;
    }
    case "message.part.removed": {
      const m = messages[event.properties.messageID];
      if (m) {
        const parts = { ...m.parts };
        delete parts[event.properties.partID];
        messages[event.properties.messageID] = { ...m, parts };
      }
      break;
    }
  }
  return { messages };
}

const FILES_MARKER = /\n?<!--nexo-files:(\[[\s\S]*?\])-->/;

/**
 * Saca de la salida de `present_files` los archivos que se le entregaron al
 * usuario, para pintarlos como tarjetas de descarga.
 */
export function presentedFiles(output: string): { files: FileRef[]; text: string } {
  const match = FILES_MARKER.exec(output);
  if (!match) return { files: [], text: output };
  try {
    const files = (JSON.parse(match[1]) as FileRef[]).filter((f) => typeof f.attachmentId === "string" && typeof f.name === "string");
    return { files, text: output.replace(FILES_MARKER, "") };
  } catch {
    return { files: [], text: output };
  }
}

function setupKind(p: NcPart) {
  if (p.type !== "tool" || p.tool !== "bash") return null;
  const command = p.state?.input?.command;
  if (clonedRepo(command)) return "clone";
  if (isScriptCommand(command)) return "script";
  return null;
}

function isSetupPart(p: NcPart) {
  return (p.type === "text" && p.synthetic) || setupKind(p) !== null;
}

function isSetupMessage(parts: NcPart[]) {
  return parts.some((p) => p.type === "tool") && parts.every((p) => isSetupPart(p) || !["text", "tool", "reasoning", "file"].includes(p.type));
}

export type SessionSetup = { repo: string | null; clone: StepStatus | null; script: StepStatus | null };

function partStatus(p: NcPart, ok: (output: string) => boolean): StepStatus {
  if (p.state?.status === "completed") return ok(p.state.output ?? "") ? "done" : "error";
  return p.state?.status === "error" ? "error" : "running";
}

/**
 * Busca el clonado y el script de configuración que se corrieron al arrancar
 * la sesión, para pintarlos como la fila de "Sesión inicializada" en vez de
 * como comandos sueltos.
 */
export function sessionSetup(state: SessionState): SessionSetup | null {
  const setup: SessionSetup = { repo: null, clone: null, script: null };
  for (const m of Object.values(state.messages)) {
    for (const p of Object.values(m.parts)) {
      const kind = setupKind(p);
      if (kind === "clone") {
        setup.repo = clonedRepo(p.state?.input?.command);
        setup.clone = partStatus(p, cloneSucceeded);
      } else if (kind === "script") setup.script = partStatus(p, scriptSucceeded);
    }
  }
  return setup.clone || setup.script ? setup : null;
}

function toPart(p: NcPart): MessagePart | null {
  if (p.type === "text" && !p.synthetic && !p.ignored && p.text) return { type: "text", text: p.text };
  if (p.type === "reasoning") return { type: "reasoning", text: p.text ?? "" };
  if (p.type === "tool" && p.state) {
    const done = p.state.status === "completed" || p.state.status === "error";
    const diff = p.state.metadata?.diff;
    const raw = done ? (p.state.status === "error" ? (p.state.error ?? "Error") : (p.state.output ?? "")) : undefined;
    const presented = raw !== undefined && p.tool?.endsWith("present_files") ? presentedFiles(raw) : null;
    return {
      type: "tool_call",
      id: p.callID ?? p.id,
      name: p.tool ?? "tool",
      input: p.state.input ?? {},
      output: presented ? presented.text : raw,
      isError: p.state.status === "error",
      diff: typeof diff === "string" ? diff : undefined,
      ...(presented?.files.length ? { files: presented.files } : {}),
    };
  }
  if (p.type === "file" && p.filename) return { type: "notice", level: "warning", text: `Adjuntó ${p.filename}` };
  return null;
}

/**
 * Convierte la sesión a mensajes del chat de Nexo. Los mensajes seguidos del
 * asistente (nexocode crea uno por paso) se juntan en una sola respuesta.
 */
export function toUIMessages(state: SessionState): UIMessage[] {
  const ordered = Object.entries(state.messages)
    .filter(([, m]) => m.info)
    .sort(([a, x], [b, y]) => x.info!.time.created - y.info!.time.created || a.localeCompare(b));
  const out: UIMessage[] = [];
  for (const [id, m] of ordered) {
    const info = m.info!;
    const raw = Object.values(m.parts);
    if (info.role === "user" ? raw.length > 0 && raw.every((p) => p.type === "text" && p.synthetic) : isSetupMessage(raw)) continue;
    const parts = raw
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(toPart)
      .filter((p): p is MessagePart => p !== null);
    if (info.error && info.error.name !== "MessageAbortedError") {
      parts.push({ type: "notice", level: "error", text: info.error.data?.message ?? info.error.name });
    }
    const prev = out.at(-1);
    if (info.role === "assistant" && prev?.role === "assistant") {
      prev.parts = [...prev.parts, ...parts];
      continue;
    }
    out.push({ id, role: info.role, parts, model: info.modelID ?? null, createdAt: new Date(info.time.created).toISOString() });
  }
  return out;
}
