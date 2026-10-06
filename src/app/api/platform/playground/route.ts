import { z } from "zod";
import type { HistoryMessage } from "@/lib/ai/types";
import { prepareModel, runCompletion } from "@/lib/platform/complete";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { apiUser, handleError } from "@/lib/session";

export const maxDuration = 800;

const Body = z.object({
  model: z.string().min(1),
  system: z.string().max(100_000).default(""),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(200_000) }))
    .min(1)
    .max(100),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  maxTokens: z.number().int().min(16).max(128_000).optional(),
});

export type PlaygroundEvent =
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "done"; usage: { inputTokens: number; outputTokens: number }; latencyMs: number; cost: number | null; truncated: boolean }
  | { type: "error"; message: string };

/**
 * Corre un prompt del playground y lo manda por streaming en NDJSON, con los
 * tokens, la latencia y el costo al final.
 */
export async function POST(request: Request) {
  try {
    const user = await apiUser();
    await enforce([{ key: `playground:u:${user.id}`, ...LIMITS.playground }]);
    const body = Body.parse(await request.json());
    const history: HistoryMessage[] = body.messages
      .filter((m) => m.content.trim())
      .map((m) => ({ role: m.role, parts: [{ type: "text", text: m.content }] }));
    if (history[0]?.role !== "user" || history.at(-1)?.role !== "user") {
      return Response.json({ error: "La conversación tiene que empezar y terminar con un mensaje del usuario." }, { status: 400 });
    }
    const prepared = await prepareModel(user.id, body.model);
    const controller = new AbortController();
    request.signal.addEventListener("abort", () => controller.abort());
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(sink) {
        let open = true;
        const send = (event: PlaygroundEvent) => {
          if (!open) return;
          try {
            sink.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            open = false;
          }
        };
        const result = await runCompletion({
          userId: user.id,
          prepared,
          system: body.system,
          history,
          effort: body.effort,
          maxTokens: body.maxTokens ? Math.min(body.maxTokens, prepared.model.maxOutput) : undefined,
          source: "playground",
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === "text" || event.type === "reasoning") send(event);
          },
        });
        if (result.error) send({ type: "error", message: result.error });
        send({ type: "done", usage: result.usage, latencyMs: result.latencyMs, cost: result.cost, truncated: result.truncated });
        if (open) sink.close();
      },
      cancel() {
        controller.abort();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Petición inválida" }, { status: 400 });
    return handleError(err);
  }
}
