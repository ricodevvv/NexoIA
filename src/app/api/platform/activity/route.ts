import { listAudit } from "@/lib/audit";
import { apiUser, handleError } from "@/lib/session";

export async function GET(request: Request) {
  try {
    const user = await apiUser();
    const before = new URL(request.url).searchParams.get("before");
    return Response.json(await listAudit({ userId: user.id }, { before: before ? new Date(before) : undefined, limit: 50 }));
  } catch (err) {
    return handleError(err);
  }
}
