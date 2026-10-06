import { z } from "zod";
import { HttpError } from "@/lib/http";
import { logError } from "@/lib/log";
import { prepareModel, runCompletion } from "@/lib/platform/complete";
import { authenticateKey } from "@/lib/platform/keys";
import { ChatCompletionRequest, chunkBody, completionBody, completionId, effortFrom, errorBody, toHistory } from "@/lib/platform/openai-format";
import { enforce, LIMITS, RateLimitError } from "@/lib/rate-limit";

export const maxDuration = 800;

function fail(err: unknown) {
  if (err instanceof z.ZodError) {
    const issue = err.issues[0];
    return Response.json(errorBody(400, `Petición inválida: ${issue?.path.join(".") || "body"} ${issue?.message ?? ""}`.trim()), { status: 400 });
  }
  if (err instanceof HttpError) {
    const headers = err instanceof RateLimitError ? { "Retry-After": String(err.retryAfter) } : undefined;
    return Response.json(errorBody(err.status, err.message), { status: err.status, headers });
  }
  logError("api.chat", err);
  return Response.json(errorBody(500, "Error interno"), { status: 500 });
}

/**
 * `POST /api/v1/chat/completions`, compatible con los SDKs de OpenAI. Sirve
 * cualquier modelo que el dueño de la key tenga en Nexo, con o sin streaming.
 */
export async function POST(request: Request) {
  try {
    const { user, key } = await authenticateKey(request.headers);
    await enforce([
      { key: `api:k:${key.id}`, ...LIMITS.api },
      { key: `api:u:${user.id}`, ...LIMITS.apiUser },
    ]);
    const body = ChatCompletionRequest.parse(await request.json().catch(() => ({})));
    const { system, history, attachments } = toHistory(body.messages);
    const prepared = await prepareModel(user.id, body.model);
    const maxTokens = Math.min(body.max_completion_tokens ?? body.max_tokens ?? prepared.model.maxOutput, prepared.model.maxOutput);
    const id = completionId();
    const controller = new AbortController();
    request.signal.addEventListener("abort", () => controller.abort());
    const base = {
      userId: user.id,
      prepared,
      system,
      history,
      attachments,
      effort: effortFrom(body.reasoning_effort),
      maxTokens,
      source: "api" as const,
      apiKeyId: key.id,
      signal: controller.signal,
    };

    if (!body.stream) {
      const result = await runCompletion(base);
      if (result.error && !result.text) return Response.json(errorBody(502, result.error), { status: 502 });
      return Response.json(
        completionBody({ id, model: body.model, text: result.text, reasoning: result.reasoning, usage: result.usage, truncated: result.truncated }),
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(sink) {
        let open = true;
        const write = (data: unknown) => {
          if (!open) return;
          try {
            sink.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            open = false;
          }
        };
        write(chunkBody({ id, model: body.model, delta: { role: "assistant", content: "" } }));
        const result = await runCompletion({
          ...base,
          onEvent: (event) => {
            if (event.type === "text") write(chunkBody({ id, model: body.model, delta: { content: event.delta } }));
            if (event.type === "reasoning") write(chunkBody({ id, model: body.model, delta: { reasoning_content: event.delta } }));
          },
        });
        if (result.error) write(errorBody(502, result.error));
        else write(chunkBody({ id, model: body.model, finish: result.truncated ? "length" : "stop" }));
        if (body.stream_options?.include_usage) write(chunkBody({ id, model: body.model, usage: result.usage }));
        if (open) {
          sink.enqueue(encoder.encode("data: [DONE]\n\n"));
          sink.close();
        }
      },
      cancel() {
        controller.abort();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
    });
  } catch (err) {
    return fail(err);
  }
}
