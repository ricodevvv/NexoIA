import { and, count, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { runPython } from "@/lib/code-exec";
import { db, schema } from "@/lib/db";
import { consume, LIMITS } from "@/lib/rate-limit";
import { conversationView } from "@/lib/conversation-view";
import { searchConversations } from "@/lib/search";
import { putFile } from "@/lib/storage";
import { parseWidget, WIDGET_TOOL, widgetSpec } from "@/lib/widgets";
import type { AttachmentData, FileRef, ToolCall, ToolResult, ToolSpec } from "./types";

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

const RunPython = z.object({ code: z.string().min(1).max(100_000) });

const runPythonSpec: ToolSpec = {
  name: "run_python",
  description:
    "Ejecuta código Python 3 en un sandbox aislado y devuelve stdout, stderr y el valor de la última expresión. Úsalo para cálculos exactos, análisis de datos, transformar archivos o generar gráficas. Hay numpy, pandas, matplotlib, scipy, sympy y scikit-learn. Los adjuntos del chat están en el directorio de trabajo (/mnt/data) con su nombre original. Las figuras de matplotlib se guardan solas; cualquier archivo que escribas en /mnt/output se entrega al usuario. No hay acceso a internet ni instalación de paquetes, y cada ejecución empieza de cero (no se conserva estado entre llamadas).",
  inputSchema: {
    properties: { code: { type: "string", description: "Programa Python completo a ejecutar." } },
    required: ["code"],
  },
};

function describeRun(out: Awaited<ReturnType<typeof runPython>>, files: FileRef[]) {
  const sections: string[] = [];
  if (out.stdout) sections.push(`stdout:\n${out.stdout.slice(0, 20_000)}`);
  if (out.stderr) sections.push(`stderr:\n${out.stderr.slice(0, 5_000)}`);
  if (out.result) sections.push(`valor final: ${out.result.slice(0, 5_000)}`);
  if (out.error) sections.push(`error:\n${out.error.slice(0, 5_000)}`);
  if (files.length) sections.push(`archivos entregados al usuario (ya los ve en el chat): ${files.map((f) => f.name).join(", ")}`);
  if (!sections.length) sections.push("Se ejecutó sin salida.");
  return `${sections.join("\n\n")}\n\n(${(out.durationMs / 1000).toFixed(1)} s)`;
}

const ConversationSearch = z.object({ query: z.string().trim().min(2).max(100) });
const ConversationRead = z.object({ id: z.string().min(1) });

const conversationSpecs: ToolSpec[] = [
  {
    name: "conversation_search",
    description:
      "Busca en las conversaciones anteriores del usuario por palabras clave. Úsala cuando el usuario haga referencia a algo que hablaron antes (\"lo que vimos la otra vez\", \"el proyecto del que te conté\") y no esté en esta conversación. Devuelve títulos, fechas, ids y un fragmento.",
    inputSchema: {
      properties: { query: { type: "string", description: "Palabras clave concretas, no una pregunta completa." } },
      required: ["query"],
    },
  },
  {
    name: "conversation_read",
    description: "Lee el contenido de una conversación anterior por su id (sacado de conversation_search) cuando el fragmento no alcanza.",
    inputSchema: { properties: { id: { type: "string" } }, required: ["id"] },
  },
];

function day(date: Date) {
  return date.toISOString().slice(0, 10);
}

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

export type BuiltinOptions = {
  userId: string;
  artifacts: boolean;
  memory: boolean;
  code: boolean;
  files: AttachmentData[];
  conversationId: string;
};

/**
 * Tools que resuelve el propio servidor, sin MCP: artifacts, widgets,
 * código y memoria.
 */
export function builtinTools(opts: BuiltinOptions): { specs: ToolSpec[]; handles(name: string): boolean; run(call: ToolCall): Promise<ToolResult> } {
  const specs = [
    ...(opts.artifacts ? [artifactSpec, widgetSpec] : []),
    ...(opts.code ? [runPythonSpec] : []),
    ...(opts.memory ? memorySpecs : []),
    ...(opts.memory ? conversationSpecs : []),
  ];
  const names = new Set(specs.map((s) => s.name));

  async function run(call: ToolCall): Promise<ToolResult> {
    const base = { id: call.id, name: call.name };
    if (call.name === ARTIFACT_TOOL) {
      const parsed = ArtifactInput.safeParse(call.input);
      if (!parsed.success) return { ...base, output: `Input inválido: ${parsed.error.issues[0]?.message}`, isError: true };
      return { ...base, output: `Artifact "${parsed.data.title}" guardado y visible para el usuario.`, isError: false };
    }
    if (call.name === WIDGET_TOOL) {
      const parsed = parseWidget(call.input);
      if (!parsed.ok) return { ...base, output: `Widget inválido: ${parsed.error}`, isError: true };
      return { ...base, output: "Widget mostrado al usuario. No repitas su contenido en el texto.", isError: false };
    }
    if (call.name === "run_python") {
      const parsed = RunPython.safeParse(call.input);
      if (!parsed.success) return { ...base, output: "Falta el código a ejecutar.", isError: true };
      const limit = await consume(`code:u:${opts.userId}`, LIMITS.code);
      if (!limit.allowed) {
        return { ...base, output: `Límite de ejecuciones alcanzado. Espera ${limit.retryAfter} s antes de volver a correr código.`, isError: true };
      }
      try {
        const out = await runPython({ code: parsed.data.code, files: opts.files.map((f) => ({ name: f.name, data: f.data })) });
        const saved: FileRef[] = [];
        for (const file of out.files) {
          const id = nanoid();
          const stored = await putFile(`${opts.userId}/${id}`, file.data, file.mediaType);
          await db.insert(schema.attachment).values({
            id,
            userId: opts.userId,
            name: file.name,
            mediaType: file.mediaType,
            size: file.data.length,
            ...stored,
          });
          saved.push({ attachmentId: id, name: file.name, mediaType: file.mediaType });
        }
        return { ...base, output: describeRun(out, saved), isError: Boolean(out.error), files: saved };
      } catch (err) {
        return { ...base, output: `No se pudo ejecutar: ${(err as Error).message}`, isError: true };
      }
    }
    if (call.name === "conversation_search") {
      const parsed = ConversationSearch.safeParse(call.input);
      if (!parsed.success) return { ...base, output: "Dame al menos dos caracteres para buscar.", isError: true };
      const results = await searchConversations(opts.userId, parsed.data.query, { limit: 6, exclude: opts.conversationId, radius: 300 });
      if (!results.length) return { ...base, output: `No hay conversaciones anteriores que mencionen "${parsed.data.query}".`, isError: false };
      const lines = results.map((r) => `- [${r.id}] ${r.title} (${day(r.updatedAt)})${r.snippet ? `\n  ${r.snippet}` : ""}`);
      return { ...base, output: lines.join("\n"), isError: false };
    }
    if (call.name === "conversation_read") {
      const parsed = ConversationRead.safeParse(call.input);
      if (!parsed.success) return { ...base, output: "Falta el id.", isError: true };
      const conv = await db.query.conversation.findFirst({
        where: and(eq(schema.conversation.id, parsed.data.id), eq(schema.conversation.userId, opts.userId)),
      });
      if (!conv) return { ...base, output: "No existe esa conversación.", isError: true };
      const view = await conversationView(conv.id, conv.currentLeafId);
      const text = view
        .map((m) => `${m.role === "user" ? "Usuario" : "Asistente"}: ${m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("")}`)
        .join("\n\n");
      const clipped = text.length > 20_000 ? `…${text.slice(-20_000)}` : text;
      return { ...base, output: `# ${conv.title} (${day(conv.updatedAt)})\n\n${clipped}`, isError: false };
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
