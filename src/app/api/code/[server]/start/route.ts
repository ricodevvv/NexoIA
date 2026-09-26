import { z } from "zod";
import { cloneCommand, cloneSucceeded, REPO_NAME, repoFolder, type SetupEvent } from "@/lib/code-setup";
import { githubAppEnabled, githubConnection, listRepos } from "@/lib/github";
import { logError } from "@/lib/log";
import { createSession, getCodeServer, nexocodeFetch, PromptInput, runShell, sendPrompt, type CodeServer } from "@/lib/nexocode";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { apiUser, handleError, HttpError } from "@/lib/session";

const Start = PromptInput.extend({
  ask: z.boolean().optional(),
  repo: z.string().regex(REPO_NAME).max(200).nullable().optional(),
});

async function sharedRepo(userId: string, fullName: string) {
  if (!(await githubAppEnabled()) || !(await githubConnection(userId))) throw new HttpError(400, "Conecta GitHub en Ajustes para clonar repos.");
  const repo = (await listRepos(userId)).find((r) => r.fullName.toLowerCase() === fullName.toLowerCase());
  if (!repo) throw new HttpError(404, `No tengo acceso a ${fullName}. Agrégalo a la app de GitHub en Ajustes.`);
  return repo;
}

function lastLines(output: string) {
  return output.trim().split("\n").slice(-4).join("\n");
}

/**
 * Arranca una sesión de Nexo Code paso a paso y va contando por dónde va,
 * una línea JSON por evento: prende el entorno, crea la sesión, clona el repo
 * elegido en la carpeta del proyecto y le manda la tarea al agente. Si algo
 * falla borra la sesión a medio hacer.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/code/[server]/start">) {
  try {
    const user = await apiUser();
    await enforce([{ key: `chat:u:${user.id}`, ...LIMITS.chatUser }]);
    const serverId = (await ctx.params).server;
    const input = Start.parse(await request.json());
    const repo = input.repo ? await sharedRepo(user.id, input.repo) : null;

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: SetupEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        let server: CodeServer | null = null;
        let session: { id: string; title: string } | null = null;
        let step: "container" | "clone" | "agent" = "container";
        try {
          emit({ step, status: "running" });
          server = await getCodeServer(user, serverId);
          session = await createSession(server, { title: input.text.slice(0, 60), ask: input.ask });
          emit({ step, status: "done" });

          if (repo) {
            step = "clone";
            emit({ step, status: "running", detail: repo.fullName });
            const clone = await runShell(server, session.id, cloneCommand(repo.fullName), input.model);
            if (!clone.ok || !cloneSucceeded(clone.output)) {
              throw new HttpError(502, `No se pudo clonar ${repo.fullName}${clone.output ? `:\n${lastLines(clone.output)}` : "."}`);
            }
            emit({ step, status: "done", detail: repo.fullName });
          }

          step = "agent";
          emit({ step, status: "running" });
          const context = repo
            ? `El repositorio de GitHub ${repo.fullName} ya está clonado en la carpeta \`${repoFolder(repo.fullName)}\` del proyecto (rama por defecto: ${repo.defaultBranch}${repo.canPush ? "" : ", solo lectura"}). Trabaja dentro de esa carpeta. git y gh ya están autenticados.`
            : input.context;
          await sendPrompt(server, session.id, { ...input, context });
          emit({ step, status: "done" });
          emit({ session });
        } catch (err) {
          if (!(err instanceof HttpError)) logError("code-start", err);
          emit({ step, status: "error" });
          emit({ error: err instanceof HttpError ? err.message : "No se pudo iniciar la sesión" });
          if (server && session) await nexocodeFetch(server, `/session/${encodeURIComponent(session.id)}`, { method: "DELETE" }).catch(() => {});
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Escribe algo para mandar" }, { status: 400 });
    return handleError(err);
  }
}
