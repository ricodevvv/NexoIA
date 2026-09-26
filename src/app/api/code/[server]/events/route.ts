import { eq } from "drizzle-orm";
import { nexocodeFetch, sessionTarget } from "@/lib/nexocode";
import { apiUser, handleError, HttpError } from "@/lib/session";
import { db, schema } from "@/lib/db";
import { logInfo } from "@/lib/log";
import { touchSession } from "@/lib/workspaces";

const FORWARD = new Set([
  "message.updated",
  "message.removed",
  "message.part.updated",
  "message.part.delta",
  "message.part.removed",
  "session.status",
  "session.idle",
  "session.error",
  "session.updated",
  "session.diff",
  "permission.asked",
  "permission.replied",
  "question.asked",
  "question.replied",
  "question.rejected",
]);

type Upstream = {
  type: string;
  properties?: { sessionID?: string; info?: { id?: string; sessionID?: string; title?: string }; part?: { sessionID?: string } };
};

function belongsTo(event: Upstream, session: string) {
  const p = event.properties;
  if (!p) return false;
  return [p.sessionID, p.part?.sessionID, p.info?.sessionID, p.info?.id].includes(session);
}

/**
 * Reenvía al navegador, como SSE, los eventos de nexocode de una sesión: el
 * texto que va saliendo, las tools, el estado y los permisos que pide.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/code/[server]/events">) {
  try {
    const user = await apiUser();
    const requested = new URL(request.url).searchParams.get("session");
    if (!requested) throw new HttpError(400, "Falta la sesión");
    const { server, session, row } = await sessionTarget(user, (await ctx.params).server, requested);

    const upstream = await nexocodeFetch(server, "/event", { signal: request.signal, timeout: null, headers: { Accept: "text/event-stream" } });
    if (!upstream.body) throw new HttpError(502, "El servidor no mandó eventos");

    const encoder = new TextEncoder();
    const reader = upstream.body.pipeThrough(new TextDecoderStream()).getReader();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let buffer = "";
        let sent = 0;
        const dropped: Record<string, number> = {};
        const started = Date.now();
        let beats = 0;
        const ping = setInterval(() => {
          controller.enqueue(encoder.encode(": ping\n\n"));
          if (row && ++beats % 3 === 0) touchSession(row.id).catch(() => {});
        }, 20_000);
        try {
          controller.enqueue(encoder.encode(": conectado\n\n"));
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;
            const chunks = buffer.split("\n\n");
            buffer = chunks.pop() ?? "";
            for (const chunk of chunks) {
              const data = chunk
                .split("\n")
                .filter((l) => l.startsWith("data:"))
                .map((l) => l.slice(5).trimStart())
                .join("\n");
              if (!data) continue;
              let event: Upstream;
              try {
                event = JSON.parse(data);
              } catch {
                continue;
              }
              if (!FORWARD.has(event.type) || !belongsTo(event, session)) {
                if (FORWARD.has(event.type)) dropped[event.type] = (dropped[event.type] ?? 0) + 1;
                continue;
              }
              if (row && event.type === "session.updated" && event.properties?.info?.title && event.properties.info.title !== row.title) {
                row.title = event.properties.info.title;
                db.update(schema.codeSession).set({ title: row.title }).where(eq(schema.codeSession.id, row.id)).catch(() => {});
              }
              sent++;
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }
        } catch {
        } finally {
          clearInterval(ping);
          if (row) {
            logInfo("code-events", { server: server.id, session, sent, dropped, seconds: Math.round((Date.now() - started) / 1000) });
          }
          try {
            controller.close();
          } catch {}
        }
      },
      cancel() {
        reader.cancel().catch(() => {});
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
    });
  } catch (err) {
    return handleError(err);
  }
}
