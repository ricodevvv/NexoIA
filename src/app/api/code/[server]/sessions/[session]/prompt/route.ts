import { z } from "zod";
import { getCodeServer, nexocodeFetch } from "@/lib/nexocode";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { apiUser, handleError } from "@/lib/session";

const Prompt = z.object({
  text: z.string().trim().min(1).max(100_000),
  model: z.object({ providerID: z.string().max(100), modelID: z.string().max(200) }).optional(),
  agent: z.enum(["build", "plan"]).optional(),
});

export async function POST(request: Request, ctx: RouteContext<"/api/code/[server]/sessions/[session]/prompt">) {
  try {
    const user = await apiUser();
    await enforce([{ key: `chat:u:${user.id}`, ...LIMITS.chatUser }]);
    const { server: serverId, session } = await ctx.params;
    const server = await getCodeServer(user, serverId);
    const input = Prompt.parse(await request.json());
    await nexocodeFetch(server, `/session/${encodeURIComponent(session)}/prompt_async`, {
      method: "POST",
      body: JSON.stringify({ parts: [{ type: "text", text: input.text }], model: input.model, agent: input.agent }),
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Escribe algo para mandar" }, { status: 400 });
    return handleError(err);
  }
}
