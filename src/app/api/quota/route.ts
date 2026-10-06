import { quotaStatus } from "@/lib/billing/usage";
import { apiUser, handleError } from "@/lib/session";

export async function GET() {
  try {
    const user = await apiUser();
    return Response.json(await quotaStatus(user.id));
  } catch (err) {
    return handleError(err);
  }
}
