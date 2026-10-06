import { audit } from "@/lib/audit";
import { revokeKey } from "@/lib/platform/keys";
import { apiUser, handleError } from "@/lib/session";

export async function DELETE(request: Request, ctx: RouteContext<"/api/platform/keys/[id]">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    const row = await revokeKey(user.id, id);
    await audit({ userId: user.id, action: "platform_key.revoked", target: row.name, metadata: { prefix: row.prefix }, headers: request.headers });
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
