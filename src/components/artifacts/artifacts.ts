import type { MessagePart } from "@/lib/ai/types";

export type ArtifactType = "html" | "react" | "svg" | "mermaid" | "markdown" | "code";

export type ArtifactVersion = {
  callId: string;
  identifier: string;
  title: string;
  type: ArtifactType;
  language?: string;
  content: string;
};

const TYPES = new Set<ArtifactType>(["html", "react", "svg", "mermaid", "markdown", "code"]);

/**
 * Lee el input de una llamada a la tool `artifact`. Devuelve null si no tiene
 * la forma esperada (por ejemplo, si el modelo mandó algo incompleto).
 */
export function readArtifact(part: MessagePart): ArtifactVersion | null {
  if (part.type !== "tool_call" || part.name !== "artifact" || part.isError) return null;
  const input = part.input as Partial<ArtifactVersion> | null;
  if (!input || typeof input.content !== "string" || typeof input.identifier !== "string") return null;
  const type = TYPES.has(input.type as ArtifactType) ? (input.type as ArtifactType) : "code";
  return {
    callId: part.id,
    identifier: input.identifier,
    title: typeof input.title === "string" ? input.title : input.identifier,
    type,
    language: typeof input.language === "string" ? input.language : undefined,
    content: input.content,
  };
}

/**
 * Junta todas las versiones de cada artifact en orden de aparición.
 */
export function collectArtifacts(messages: { parts: MessagePart[] }[]) {
  const map = new Map<string, ArtifactVersion[]>();
  for (const m of messages) {
    for (const part of m.parts) {
      const artifact = readArtifact(part);
      if (!artifact) continue;
      map.set(artifact.identifier, [...(map.get(artifact.identifier) ?? []), artifact]);
    }
  }
  return map;
}

const EXTENSIONS: Record<ArtifactType, string> = {
  html: "html",
  react: "tsx",
  svg: "svg",
  mermaid: "mmd",
  markdown: "md",
  code: "txt",
};

const LANG_EXT: Record<string, string> = {
  python: "py",
  javascript: "js",
  typescript: "ts",
  java: "java",
  kotlin: "kt",
  go: "go",
  rust: "rs",
  sql: "sql",
  bash: "sh",
  shell: "sh",
  css: "css",
  json: "json",
  yaml: "yml",
  csharp: "cs",
  cpp: "cpp",
  c: "c",
  ruby: "rb",
  php: "php",
  swift: "swift",
};

export function fileName(a: ArtifactVersion) {
  const ext = a.type === "code" ? (LANG_EXT[a.language?.toLowerCase() ?? ""] ?? "txt") : EXTENSIONS[a.type];
  return `${a.identifier}.${ext}`;
}

export function codeLanguage(a: ArtifactVersion) {
  if (a.type === "react") return "tsx";
  if (a.type === "code") return a.language ?? "text";
  if (a.type === "mermaid") return "text";
  return a.type;
}

export function hasPreview(a: ArtifactVersion) {
  return a.type !== "code";
}
