import { REPO_NAME } from "@/lib/code-setup";
import { githubAppEnabled, githubConnection, listBranches, listRepos } from "@/lib/github";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { apiUser, handleError, HttpError } from "@/lib/session";

/**
 * Las ramas de un repo compartido con Nexo, con la por defecto primero, para
 * elegir en cuál arranca una sesión de código.
 */
export async function GET(request: Request) {
  try {
    const user = await apiUser();
    await enforce([{ key: `github:u:${user.id}`, ...LIMITS.github }]);
    const fullName = new URL(request.url).searchParams.get("repo") ?? "";
    if (!REPO_NAME.test(fullName)) throw new HttpError(400, "Repo inválido");
    if (!(await githubAppEnabled()) || !(await githubConnection(user.id))) throw new HttpError(404, "Conecta GitHub en Ajustes.");
    const repo = (await listRepos(user.id)).find((r) => r.fullName.toLowerCase() === fullName.toLowerCase());
    if (!repo) throw new HttpError(404, `No tengo acceso a ${fullName}.`);
    const branches = await listBranches(user.id, repo.fullName);
    return Response.json({ defaultBranch: repo.defaultBranch, branches: [repo.defaultBranch, ...branches.filter((b) => b !== repo.defaultBranch)] });
  } catch (err) {
    return handleError(err);
  }
}
