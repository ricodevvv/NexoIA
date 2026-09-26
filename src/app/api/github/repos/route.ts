import { githubAppEnabled, githubConnection, listRepos } from "@/lib/github";
import { apiUser, handleError, HttpError } from "@/lib/session";

/**
 * Los repos de GitHub que el usuario compartió con Nexo, para elegir uno al
 * empezar una sesión de código.
 */
export async function GET() {
  try {
    const user = await apiUser();
    if (!(await githubAppEnabled())) return Response.json({ connected: false, repos: [] });
    if (!(await githubConnection(user.id))) return Response.json({ connected: false, repos: [] });
    try {
      return Response.json({ connected: true, repos: await listRepos(user.id) });
    } catch (err) {
      if (err instanceof HttpError && err.status === 409) return Response.json({ connected: false, repos: [] });
      throw err;
    }
  } catch (err) {
    return handleError(err);
  }
}
