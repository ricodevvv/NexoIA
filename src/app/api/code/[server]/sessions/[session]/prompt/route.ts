import { z } from "zod";
import { getCodeServer, PromptInput, sendPrompt } from "@/lib/nexocode";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { apiUser, handleError } from "@/lib/session";

export async function POST(request: Request, ctx: RouteContext<"/api/code/[server]/sessions/[session]/prompt">) {
  try {
    const user = await apiUser();
    await enforce([{ key: `chat:u:${user.id}`, ...LIMITS.chatUser }]);
    const { server: serverId, session } = await ctx.params;
    const server = await getCodeServer(user, serverId);
    await sendPrompt(server, session, PromptInput.parse(await request.json()));
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Escribe algo para mandar" }, { status: 400 });
    return handleError(err);
  }
}
