import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ToolSpec } from "./types";

export const SKILL_TOOL = "skill";

export type Skill = { name: string; description: string; requires: "code" | "artifacts" | null; body: string };

const DIR = path.join(process.cwd(), "prompts", "chat", "skills");

let cached: Skill[] | null = null;

function parse(raw: string): Skill | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  const meta = Object.fromEntries(
    match[1]
      .split("\n")
      .map((line) => line.match(/^([a-z_]+):\s*(.*)$/))
      .filter((m): m is RegExpMatchArray => Boolean(m))
      .map((m) => [m[1], m[2].trim()]),
  );
  if (!meta.name || !meta.description) return null;
  const requires = meta.requires === "code" || meta.requires === "artifacts" ? meta.requires : null;
  return { name: meta.name, description: meta.description, requires, body: match[2].trim() };
}

/**
 * Lee una vez los skills del chat de `prompts/chat/skills/<nombre>/SKILL.md`.
 * Si la carpeta no está (por ejemplo en una build sin `prompts/`), no hay
 * skills y la tool no se ofrece.
 */
export function chatSkills(): Skill[] {
  if (cached) return cached;
  const found: Skill[] = [];
  try {
    for (const entry of readdirSync(DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const skill = parse(readFileSync(path.join(DIR, entry.name, "SKILL.md"), "utf8"));
        if (skill && skill.name === entry.name) found.push(skill);
      } catch {}
    }
  } catch {}
  cached = found.sort((a, b) => a.name.localeCompare(b.name));
  return cached;
}

/**
 * Los skills que sirven con las tools que tiene esta conversación: los que
 * dependen de `run_python` o de los artifacts solo aparecen si están activos.
 */
export function availableSkills(opts: { code: boolean; artifacts: boolean }) {
  return chatSkills().filter((s) => !s.requires || opts[s.requires]);
}

export function skillSpec(skills: Skill[]): ToolSpec {
  return {
    name: SKILL_TOOL,
    description: [
      "Carga las instrucciones completas de un skill: una guía de cómo hacer bien un tipo de tarea concreto. Llámala antes de empezar la tarea cuando alguno aplique, una sola vez por conversación, y sigue lo que dice. Skills disponibles:",
      ...skills.map((s) => `- ${s.name}: ${s.description}`),
    ].join("\n"),
    inputSchema: {
      properties: { name: { type: "string", enum: skills.map((s) => s.name), description: "Nombre del skill." } },
      required: ["name"],
    },
  };
}
