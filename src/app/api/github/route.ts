import { disconnect, githubAppEnabled, githubConnection, listInstallations } from "@/lib/github";
import { apiUser, handleError, HttpError } from "@/lib/session";

/**
 * Estado de la integración para la pestaña de ajustes: si está configurada,
 * la cuenta conectada y las cuentas u organizaciones donde está instalada.
 */
export async function GET() {
  try {
    const user = await apiUser();
    if (!githubAppEnabled()) return Response.json({ enabled: false, connection: null, installations: [] });
    const conn = await githubConnection(user.id);
    if (!conn) return Response.json({ enabled: true, connection: null, installations: [] });
    try {
      const installations = await listInstallations(user.id);
      return Response.json({ enabled: true, connection: { login: conn.login, avatarUrl: conn.avatarUrl }, installations });
    } catch (err) {
      if (err instanceof HttpError && err.status === 409) return Response.json({ enabled: true, connection: null, installations: [], expired: true });
      throw err;
    }
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE() {
  try {
    const user = await apiUser();
    await disconnect(user.id);
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
