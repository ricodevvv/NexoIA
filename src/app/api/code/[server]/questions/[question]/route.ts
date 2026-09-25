import { z } from "zod";
import { getCodeServer, nexocodeFetch } from "@/lib/nexocode";
import { apiUser, handleError } from "@/lib/session";

const Body = z.union([
  z.object({ answers: z.array(z.array(z.string().max(2000)).max(20)).max(10) }),
  z.object({ reject: z.literal(true) }),
]);

/**
 * Responde (o descarta) una pregunta que el agente le hizo al usuario.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/code/[server]/questions/[question]">) {
  try {
    const user = await apiUser();
    const { server: serverId, question } = await ctx.params;
    const server = await getCodeServer(user, serverId);
    const body = Body.parse(await request.json());
    const id = encodeURIComponent(question);
    if ("reject" in body) await nexocodeFetch(server, `/question/${id}/reject`, { method: "POST", body: "{}" });
    else await nexocodeFetch(server, `/question/${id}/reply`, { method: "POST", body: JSON.stringify({ answers: body.answers }) });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Respuesta inválida" }, { status: 400 });
    return handleError(err);
  }
}
