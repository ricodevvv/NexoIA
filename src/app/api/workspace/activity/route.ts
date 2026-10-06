import { listAudit } from "@/lib/audit";
import { apiSession, handleError, HttpError } from "@/lib/session";
import { activeWorkspace, canManage } from "@/lib/workspace";

/**
 * Bitácora del equipo activo. Solo la ven dueños y admins.
 */
export async function GET(request: Request) {
  try {
    const auth = await apiSession();
    const workspace = await activeWorkspace(auth);
    if (!workspace || !canManage(workspace.role)) throw new HttpError(403, "Solo los admins ven la actividad del equipo");
    const before = new URL(request.url).searchParams.get("before");
    return Response.json(await listAudit({ organizationId: workspace.id }, { before: before ? new Date(before) : undefined, limit: 50 }));
  } catch (err) {
    return handleError(err);
  }
}
