import { and, count, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import type { ToolCall, ToolResult, ToolSpec } from "./types";

export const ARTIFACT_TOOL = "artifact";
export const ARTIFACT_TYPES = ["html", "react", "svg", "mermaid", "markdown", "code"] as const;

export const ArtifactInput = z.object({
  identifier: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  type: z.enum(ARTIFACT_TYPES),
  language: z.string().max(30).optional(),
  content: z.string().min(1).max(400_000),
});

export type ArtifactPayload = z.infer<typeof ArtifactInput>;

const MemorySave = z.object({ content: z.string().trim().min(3).max(500) });
const MemoryDelete = z.object({ id: z.string().min(1) });
const MAX_MEMORIES = 100;

const artifactSpec: ToolSpec = {
  name: ARTIFACT_TOOL,
  description:
    "Crea o reemplaza un artifact: contenido sustancial y autocontenido que el usuario va a querer ver aparte, reutilizar o iterar (páginas HTML, componentes React, diagramas, SVG, documentos largos, programas completos). Para editar uno existente, llama de nuevo con el mismo identifier y el contenido completo actualizado.",
  inputSchema: {
    properties: {
      identifier: { type: "string", description: "Id estable en kebab-case, p. ej. 'landing-cafe'. Reutilízalo para nuevas versiones." },
      title: { type: "string", description: "Título corto y descriptivo." },
      type: {
        type: "string",
        enum: [...ARTIFACT_TYPES],
        description:
          "html: página completa con CSS/JS inline. react: un componente con export default, puede importar paquetes npm y usar clases de Tailwind. svg: un <svg>. mermaid: código de diagrama Mermaid. markdown: documento. code: código fuente de otro tipo.",
      },
      language: { type: "string", description: "Solo para type=code: lenguaje del código (python, go, sql...)." },
      content: { type: "string", description: "El contenido completo, nunca parcial." },
    },
    required: ["identifier", "title", "type", "content"],
  },
};

const memorySpecs: ToolSpec[] = [
  {
    name: "memory_save",
    description:
      "Guarda un dato duradero sobre el usuario que valga la pena recordar en futuras conversaciones (preferencias, contexto de trabajo, proyectos). Úsalo con criterio, no para detalles triviales ni información sensible que no te pidió guardar.",
    inputSchema: {
      properties: { content: { type: "string", description: "El recuerdo en una frase, en tercera persona." } },
      required: ["content"],
    },
  },
  {
    name: "memory_delete",
    description: "Borra un recuerdo guardado por su id, cuando el usuario lo pide o quedó obsoleto.",
    inputSchema: { properties: { id: { type: "string" } }, required: ["id"] },
  },
];

export type BuiltinOptions = { userId: string; artifacts: boolean; memory: boolean };

/**
 * Tools que resuelve el propio servidor, sin MCP: artifacts y memoria.
 */
export function builtinTools(opts: BuiltinOptions): { specs: ToolSpec[]; handles(name: string): boolean; run(call: ToolCall): Promise<ToolResult> } {
  const specs = [...(opts.artifacts ? [artifactSpec] : []), ...(opts.memory ? memorySpecs : [])];
  const names = new Set(specs.map((s) => s.name));

  async function run(call: ToolCall): Promise<ToolResult> {
    const base = { id: call.id, name: call.name };
    if (call.name === ARTIFACT_TOOL) {
      const parsed = ArtifactInput.safeParse(call.input);
      if (!parsed.success) return { ...base, output: `Input inválido: ${parsed.error.issues[0]?.message}`, isError: true };
      return { ...base, output: `Artifact "${parsed.data.title}" guardado y visible para el usuario.`, isError: false };
    }
    if (call.name === "memory_save") {
      const parsed = MemorySave.safeParse(call.input);
      if (!parsed.success) return { ...base, output: "El recuerdo debe tener entre 3 y 500 caracteres.", isError: true };
      const [row] = await db.select({ n: count() }).from(schema.memory).where(eq(schema.memory.userId, opts.userId));
      if ((row?.n ?? 0) >= MAX_MEMORIES) {
        return { ...base, output: "La memoria está llena. Borra recuerdos viejos antes de guardar nuevos.", isError: true };
      }
      const id = nanoid(10);
      await db.insert(schema.memory).values({ id, userId: opts.userId, content: parsed.data.content });
      return { ...base, output: `Guardado con id ${id}.`, isError: false };
    }
    if (call.name === "memory_delete") {
      const parsed = MemoryDelete.safeParse(call.input);
      if (!parsed.success) return { ...base, output: "Falta el id.", isError: true };
      const deleted = await db
        .delete(schema.memory)
        .where(and(eq(schema.memory.id, parsed.data.id), eq(schema.memory.userId, opts.userId)))
        .returning({ id: schema.memory.id });
      return deleted.length
        ? { ...base, output: "Recuerdo borrado.", isError: false }
        : { ...base, output: "No existe un recuerdo con ese id.", isError: true };
    }
    return { ...base, output: `Tool desconocida: ${call.name}`, isError: true };
  }

  return { specs, handles: (name) => names.has(name), run };
}
