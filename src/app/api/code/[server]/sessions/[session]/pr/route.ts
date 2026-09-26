import { eq } from "drizzle-orm";
import { pushCommand, pushResult } from "@/lib/code-setup";
import { db, schema } from "@/lib/db";
import { openPullRequest, repoInfo } from "@/lib/github";
import { logError } from "@/lib/log";
import { isCloud, nexocodeJson, runShell, sessionTarget } from "@/lib/nexocode";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { apiUser, handleError, HttpError } from "@/lib/session";
import { getSessionRow } from "@/lib/workspaces";

function lastLines(output: string) {
  return output.trim().split("\n").slice(-6).join("\n");
}

function prBody(commits: string[]) {
  const list = commits
    .slice()
    .reverse()
    .map((c) => `- ${c}`)
    .join("\n");
  return `## Cambios\n\n${list}\n\n---\nHecho con Nexo Code.`;
}

/**
 * El pull request que ya se abrió desde esta sesión, si hay uno.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/code/[server]/sessions/[session]/pr">) {
  try {
    const user = await apiUser();
    const { server: serverId, session } = await ctx.params;
    if (!isCloud(serverId)) return Response.json({ repo: null, url: null });
    const row = await getSessionRow(user.id, session);
    return Response.json({ repo: row.repo, url: row.prUrl });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Crea el pull request de la sesión como el botón de Claude Code: pasa el
 * repo a una rama nueva si estaba en la por defecto, guarda lo pendiente en
 * un commit, la sube y abre el PR (o devuelve el que ya estaba abierto, que
 * se actualiza solo con el push).
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/code/[server]/sessions/[session]/pr">) {
  try {
    const user = await apiUser();
    await enforce([{ key: `chat:u:${user.id}`, ...LIMITS.chatUser }]);
    const { server: serverId, session: requested } = await ctx.params;
    if (!isCloud(serverId)) throw new HttpError(400, "Los pull requests se crean desde los entornos en la nube");
    const { server, session, row } = await sessionTarget(user, serverId, requested);
    if (!row?.repo) throw new HttpError(400, "Esta sesión no tiene un repo de GitHub");

    const status = await nexocodeJson<Record<string, { type: string }>>(server, "/session/status").catch(() => ({}) as Record<string, { type: string }>);
    if (status[session]?.type === "busy") throw new HttpError(409, "Espera a que el agente termine para crear el PR");

    const repo = await repoInfo(user.id, row.repo);
    if (!repo.canPush) throw new HttpError(403, `No tienes permiso para subir cambios a ${repo.fullName}`);
    const info = await nexocodeJson<{ title?: string }>(server, `/session/${encodeURIComponent(session)}`);
    const title = (info.title || row.title).slice(0, 200);

    const pushed = await runShell(server, session, pushCommand(repo.fullName, repo.defaultBranch, title));
    const { branch, commits } = pushResult(pushed.output);
    if (!pushed.ok || !branch) throw new HttpError(502, `No se pudo subir la rama${pushed.output ? `:\n${lastLines(pushed.output)}` : "."}`);
    if (branch === repo.defaultBranch) throw new HttpError(409, `El repo quedó en ${branch}, la rama por defecto`);
    if (commits.length === 0) throw new HttpError(400, `No hay cambios respecto a ${repo.defaultBranch} para el PR`);

    const pr = await openPullRequest(user.id, repo.fullName, { head: branch, base: repo.defaultBranch, title, body: prBody(commits) });
    await db.update(schema.codeSession).set({ prUrl: pr.url }).where(eq(schema.codeSession.id, row.id));
    return Response.json({ url: pr.url, number: pr.number, branch, created: pr.created, commits: commits.length });
  } catch (err) {
    if (!(err instanceof HttpError)) logError("code-pr", err);
    return handleError(err);
  }
}
