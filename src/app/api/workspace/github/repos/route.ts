import { githubAppEnabled, githubConnection, listInstallations, listRepos } from "@/lib/github";
import { handleError, HttpError } from "@/lib/http";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { workspaceFromRequest } from "@/lib/workspaces";

/**
 * Los repos y las cuentas de GitHub a los que el agente tiene acceso, para la
 * tool `github_repos` del espacio.
 */
export async function GET(request: Request) {
  try {
    const row = await workspaceFromRequest(request);
    await enforce([{ key: `github:u:${row.userId}`, ...LIMITS.github }]);
    if (!(await githubAppEnabled())) throw new HttpError(404, "La integración con GitHub no está configurada en este servidor.");
    const conn = await githubConnection(row.userId);
    if (!conn) throw new HttpError(404, "El usuario no ha conectado GitHub. Pídele que lo haga en Ajustes → GitHub.");
    const [installations, repos] = await Promise.all([listInstallations(row.userId), listRepos(row.userId)]);
    return Response.json({ login: conn.login, installations: installations.map((i) => ({ account: i.account, type: i.type, selection: i.selection })), repos });
  } catch (err) {
    return handleError(err);
  }
}
