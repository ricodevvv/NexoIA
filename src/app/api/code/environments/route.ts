import { z } from "zod";
import { egressEnabled } from "@/lib/egress";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { apiUser, handleError, HttpError } from "@/lib/session";
import { CLOUD_PREFIX, createEnvironment, EnvironmentInput, listEnvironments, publicEnvironment, workspacesAllowed } from "@/lib/workspaces";

/**
 * Los entornos en la nube del usuario con toda su configuración, y si el
 * servidor puede aplicar los niveles de red.
 */
export async function GET() {
  try {
    const user = await apiUser();
    if (!(await workspacesAllowed(user))) return Response.json({ environments: [], egress: false });
    const environments = (await listEnvironments(user.id)).map((e) => ({ ...publicEnvironment(e), serverId: `${CLOUD_PREFIX}${e.id}` }));
    return Response.json({ environments, egress: egressEnabled() });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await apiUser();
    await enforce([{ key: `code:envs:u:${user.id}`, ...LIMITS.connector }]);
    if (!(await workspacesAllowed(user))) throw new HttpError(403, "Tu plan no incluye entornos en la nube");
    const env = await createEnvironment(user.id, EnvironmentInput.parse(await request.json()));
    return Response.json({ ...publicEnvironment(env), serverId: `${CLOUD_PREFIX}${env.id}` });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Revisa los campos del entorno" }, { status: 400 });
    return handleError(err);
  }
}
