import { z } from "zod";
import { getCodeServer, nexocodeFetch } from "@/lib/nexocode";
import { apiUser, handleError } from "@/lib/session";

const Reply = z.object({ reply: z.enum(["once", "always", "reject"]) });

export async function POST(request: Request, ctx: RouteContext<"/api/code/[server]/permissions/[permission]">) {
  try {
    const user = await apiUser();
    const { server: serverId, permission } = await ctx.params;
    const server = await getCodeServer(user, serverId);
    const { reply } = Reply.parse(await request.json());
    await nexocodeFetch(server, `/permission/${encodeURIComponent(permission)}/reply`, { method: "POST", body: JSON.stringify({ reply }) });
    return Response.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
