import { commitIdentity, githubAppEnabled, githubToken } from "@/lib/github";
import { handleError, HttpError } from "@/lib/http";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { workspaceFromRequest } from "@/lib/workspaces";

/**
 * El credential helper de git del espacio pide aquí la clave para github.com.
 * Devuelve el token del usuario al momento, así nunca vive guardado en el pod,
 * y la identidad con la que firmar los commits.
 */
export async function POST(request: Request) {
  try {
    const row = await workspaceFromRequest(request);
    await enforce([{ key: `github:u:${row.userId}`, ...LIMITS.github }]);
    if (!(await githubAppEnabled())) throw new HttpError(404, "La integración con GitHub no está configurada en este servidor.");
    const { token, conn } = await githubToken(row.userId);
    return Response.json({ username: "x-access-token", password: token, login: conn.login, ...commitIdentity(conn) });
  } catch (err) {
    return handleError(err);
  }
}
