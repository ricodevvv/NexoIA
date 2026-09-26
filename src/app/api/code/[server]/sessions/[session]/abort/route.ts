import { nexocodeFetch, sessionTarget } from "@/lib/nexocode";
import { apiUser, handleError } from "@/lib/session";

export async function POST(_request: Request, ctx: RouteContext<"/api/code/[server]/sessions/[session]/abort">) {
  try {
    const user = await apiUser();
    const { server: serverId, session } = await ctx.params;
    const target = await sessionTarget(user, serverId, session);
    await nexocodeFetch(target.server, `/session/${encodeURIComponent(target.session)}/abort`, { method: "POST" });
    return Response.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
