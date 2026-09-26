import { eq } from "drizzle-orm";
import { z } from "zod";
import { cloneCommand, cloneSucceeded, REPO_NAME, repoFolder, scriptCommand, scriptSucceeded, type SetupEvent, type SetupStep } from "@/lib/code-setup";
import { db, schema } from "@/lib/db";
import { githubAppEnabled, githubConnection, listRepos } from "@/lib/github";
import { logError } from "@/lib/log";
import { type CodeServer, createSession, getCodeServer, isCloud, nexocodeFetch, PromptInput, runShell, sendPrompt } from "@/lib/nexocode";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { apiUser, handleError, HttpError } from "@/lib/session";
import { CLOUD_PREFIX, createSessionRow, deleteSession, ensureSessionPod, getEnvironment } from "@/lib/workspaces";

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
  return output.trim().split("\n").slice(-6).join("\n");
}

/**
 * Arranca una sesión de Nexo Code paso a paso y va contando por dónde va,
 * una línea JSON por evento, como el arranque de Claude Code en la web:
 * prende el contenedor (en la nube uno nuevo para esta sesión), clona el repo
 * elegido, corre el script de configuración del entorno y le manda la tarea al
 * agente. Si algo falla borra la sesión a medio hacer.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/code/[server]/start">) {
  try {
    const user = await apiUser();
    await enforce([{ key: `chat:u:${user.id}`, ...LIMITS.chatUser }]);
    const serverId = (await ctx.params).server;
    const input = Start.parse(await request.json());
    const repo = input.repo ? await sharedRepo(user.id, input.repo) : null;
    const cloud = isCloud(serverId);
    const env = cloud ? await getEnvironment(user.id, serverId.slice(CLOUD_PREFIX.length)) : null;
    const title = input.text.slice(0, 60);

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: SetupEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        let server: CodeServer | null = null;
        let agentSession: string | null = null;
        let rowId: string | null = null;
        let step: SetupStep = "container";
        try {
          emit({ step, status: "running" });
          if (env) {
            const row = await createSessionRow(user, env, { title, repo: repo?.fullName ?? null });
            rowId = row.id;
            server = await ensureSessionPod(user, row, env.name);
          } else {
            server = await getCodeServer(user, serverId);
          }
          agentSession = (await createSession(server, { title, ask: input.ask })).id;
          if (rowId) await db.update(schema.codeSession).set({ agentSessionId: agentSession }).where(eq(schema.codeSession.id, rowId));
          emit({ step, status: "done" });

          if (repo) {
            step = "clone";
            emit({ step, status: "running", detail: repo.fullName });
            const clone = await runShell(server, agentSession, cloneCommand(repo.fullName), input.model);
            if (!clone.ok || !cloneSucceeded(clone.output)) {
              throw new HttpError(502, `No se pudo clonar ${repo.fullName}${clone.output ? `:\n${lastLines(clone.output)}` : "."}`);
            }
            emit({ step, status: "done", detail: repo.fullName });
          }

          step = "script";
          if (env?.setupScript.trim()) {
            emit({ step, status: "running" });
            const script = await runShell(server, agentSession, scriptCommand(repo?.fullName ?? null), input.model);
            if (!script.ok || !scriptSucceeded(script.output)) {
              throw new HttpError(502, `El script de configuración falló${script.output ? `:\n${lastLines(script.output)}` : "."}`);
            }
            emit({ step, status: "done" });
          } else {
            emit({ step, status: "skipped" });
          }

          step = "agent";
          emit({ step, status: "running" });
          const context = repo
            ? `El repositorio de GitHub ${repo.fullName} ya está clonado en la carpeta \`${repoFolder(repo.fullName)}\` del proyecto (rama por defecto: ${repo.defaultBranch}${repo.canPush ? "" : ", solo lectura"}). Trabaja dentro de esa carpeta. git y gh ya están autenticados.`
            : input.context;
          await sendPrompt(server, agentSession, { ...input, context });
          emit({ step, status: "done" });
          emit({ session: { id: rowId ?? agentSession, title } });
        } catch (err) {
          if (!(err instanceof HttpError)) logError("code-start", err);
          emit({ step, status: "error" });
          emit({ error: err instanceof HttpError ? err.message : "No se pudo iniciar la sesión" });
          if (rowId) await deleteSession(rowId).catch(() => {});
          else if (server && agentSession) await nexocodeFetch(server, `/session/${encodeURIComponent(agentSession)}`, { method: "DELETE" }).catch(() => {});
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
