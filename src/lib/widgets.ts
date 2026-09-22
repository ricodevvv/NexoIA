import { z } from "zod";
import type { ToolSpec } from "./ai/types";

export const WIDGET_TOOL = "show_widget";

const text = (max = 400) => z.string().trim().min(1).max(max);
const url = z.string().url().max(2000).refine((u) => /^https?:\/\//.test(u), "Solo enlaces http(s)");

const Chart = z.object({
  type: z.literal("chart"),
  title: text(120),
  subtitle: text(120).optional(),
  kind: z.enum(["line", "bar"]).default("line"),
  categories: z.array(text(40)).min(2).max(40),
  series: z
    .array(z.object({ name: text(40), values: z.array(z.number()).min(2).max(40) }))
    .min(1)
    .max(6),
});

const Steps = z.object({
  type: z.literal("steps"),
  title: text(120).optional(),
  steps: z.array(z.object({ title: text(120), description: text(800) })).min(2).max(12),
});

const Quiz = z.object({
  type: z.literal("quiz"),
  title: text(120).optional(),
  questions: z
    .array(
      z.object({
        question: text(300),
        options: z.array(text(160)).min(2).max(6),
        answer: z.number().int().min(0),
        explanation: text(600).optional(),
      }),
    )
    .min(1)
    .max(15),
});

const Comparison = z.object({
  type: z.literal("comparison"),
  title: text(120).optional(),
  items: z
    .array(z.object({ name: text(60), rows: z.array(z.object({ label: text(60), value: text(160) })).min(1).max(12) }))
    .min(2)
    .max(5),
});

const Links = z.object({
  type: z.literal("links"),
  title: text(120).optional(),
  links: z.array(z.object({ title: text(120), description: text(240).optional(), url })).min(1).max(10),
});

const Recipe = z.object({
  type: z.literal("recipe"),
  title: text(120),
  description: text(300).optional(),
  servings: z.number().int().min(1).max(50),
  images: z.array(z.object({ url, credit: text(60).optional() })).max(3).optional(),
  ingredients: z.array(z.object({ amount: z.number().min(0).optional(), unit: text(30).optional(), name: text(120) })).min(1).max(40),
  steps: z.array(z.object({ title: text(80).optional(), text: text(600) })).min(1).max(20),
});

const Weather = z.object({
  type: z.literal("weather"),
  location: text(80),
  temperature: z.number(),
  condition: text(60),
  unit: z.enum(["C", "F"]).default("C"),
  source: text(80).optional(),
  days: z
    .array(z.object({ day: text(12), max: z.number(), min: z.number().optional(), rain: z.number().min(0).max(100).optional() }))
    .max(10)
    .optional(),
});

const Diagram = z.object({
  type: z.literal("diagram"),
  title: text(120).optional(),
  nodes: z
    .array(
      z.object({
        id: text(40),
        label: text(40),
        detail: text(60).optional(),
        tone: z.enum(["neutral", "blue", "purple", "green", "orange"]).default("neutral"),
      }),
    )
    .min(2)
    .max(16),
  edges: z.array(z.object({ from: text(40), to: text(40) })).max(30),
});

export const WidgetInput = z.discriminatedUnion("type", [Chart, Steps, Quiz, Comparison, Links, Recipe, Weather, Diagram]);

export type Widget = z.infer<typeof WidgetInput>;
export type WidgetOf<T extends Widget["type"]> = Extract<Widget, { type: T }>;

export const WIDGET_TYPES = ["chart", "steps", "quiz", "comparison", "links", "recipe", "weather", "diagram"] as const;

/**
 * Valida el input de un widget y revisa lo que zod no puede: que las series
 * tengan tantos valores como categorías, que la respuesta del quiz exista y
 * que las aristas del diagrama apunten a nodos reales.
 */
export function parseWidget(input: unknown): { ok: true; widget: Widget } | { ok: false; error: string } {
  const parsed = WidgetInput.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join(".") || "input"}: ${issue?.message}` };
  }
  const w = parsed.data;
  if (w.type === "chart" && w.series.some((s) => s.values.length !== w.categories.length)) {
    return { ok: false, error: "Cada serie debe tener un valor por categoría." };
  }
  if (w.type === "quiz" && w.questions.some((q) => q.answer >= q.options.length)) {
    return { ok: false, error: "El índice de la respuesta correcta no existe en las opciones." };
  }
  if (w.type === "diagram") {
    const ids = new Set(w.nodes.map((n) => n.id));
    if (w.edges.some((e) => !ids.has(e.from) || !ids.has(e.to))) return { ok: false, error: "Hay aristas que apuntan a nodos inexistentes." };
  }
  return { ok: true, widget: w };
}

export const widgetSpec: ToolSpec = {
  name: WIDGET_TOOL,
  description: [
    "Muestra un widget interactivo dentro de la respuesta. Úsalo cuando una visualización ayude más que el texto: datos numéricos que se comparan en el tiempo (chart), un procedimiento de varios pasos (steps), repasar o evaluar conocimiento (quiz), comparar opciones lado a lado (comparison), recursos recomendados (links), recetas (recipe), clima con datos reales que ya tengas (weather) o flujos y arquitecturas (diagram).",
    "No lo uses para cosas que se leen bien como texto o tabla simple, ni inventes datos: los números del chart y del clima deben venir de la conversación, de una búsqueda o de un cálculo. Sigue escribiendo texto normal antes y después del widget.",
    "Forma del input según type:",
    "chart: {title, subtitle?, kind: 'line'|'bar', categories: string[], series: [{name, values: number[] (uno por categoría)}]}",
    "steps: {title?, steps: [{title, description}]}",
    "quiz: {title?, questions: [{question, options: string[], answer: índice desde 0, explanation?}]}",
    "comparison: {title?, items: [{name, rows: [{label, value}]}]} (mismas labels en todos los items)",
    "links: {title?, links: [{title, description?, url}]}",
    "recipe: {title, description?, servings, images?: [{url, credit?}], ingredients: [{amount?, unit?, name}], steps: [{title?, text}]}",
    "weather: {location, temperature, condition, unit?: 'C'|'F', source?, days?: [{day, max, min?, rain? (% 0-100)}]}",
    "diagram: {title?, nodes: [{id, label, detail?, tone?: 'neutral'|'blue'|'purple'|'green'|'orange'}], edges: [{from, to}]}",
  ].join("\n"),
  inputSchema: {
    properties: {
      type: { type: "string", enum: [...WIDGET_TYPES], description: "Tipo de widget." },
    },
    required: ["type"],
    additionalProperties: true,
  },
};
