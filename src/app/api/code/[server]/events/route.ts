import { getCodeServer, nexocodeFetch } from "@/lib/nexocode";
import { apiUser, handleError, HttpError } from "@/lib/session";
import { touchWorkspace, WORKSPACE_SERVER_ID } from "@/lib/workspaces";

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
]);

type Upstream = { type: string; properties?: { sessionID?: string; info?: { id?: string } } };

function belongsTo(event: Upstream, session: string) {
  const p = event.properties;
  if (!p) return false;
  return (p.sessionID ?? p.info?.id) === session;
}

/**
 * Reenvía al navegador, como SSE, los eventos de nexocode de una sesión: el
 * texto que va saliendo, las tools, el estado y los permisos que pide.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/code/[server]/events">) {
  try {
    const user = await apiUser();
    const server = await getCodeServer(user, (await ctx.params).server);
    const session = new URL(request.url).searchParams.get("session");
    if (!session) throw new HttpError(400, "Falta la sesión");

    const upstream = await nexocodeFetch(server, "/event", { signal: request.signal, timeout: null, headers: { Accept: "text/event-stream" } });
    if (!upstream.body) throw new HttpError(502, "El servidor no mandó eventos");

    const encoder = new TextEncoder();
    const reader = upstream.body.pipeThrough(new TextDecoderStream()).getReader();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let buffer = "";
        let beats = 0;
        const ping = setInterval(() => {
          controller.enqueue(encoder.encode(": ping\n\n"));
          if (server.id === WORKSPACE_SERVER_ID && ++beats % 3 === 0) touchWorkspace(user.id).catch(() => {});
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
              if (!FORWARD.has(event.type) || !belongsTo(event, session)) continue;
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }
        } catch {
        } finally {
          clearInterval(ping);
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
