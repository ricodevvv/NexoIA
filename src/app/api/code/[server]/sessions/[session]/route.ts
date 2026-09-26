import { getCodeServer, isCloud, nexocodeFetch, nexocodeJson, sessionTarget } from "@/lib/nexocode";
import { apiUser, handleError } from "@/lib/session";
import { deleteSession, getSessionRow } from "@/lib/workspaces";

export async function GET(_request: Request, ctx: RouteContext<"/api/code/[server]/sessions/[session]">) {
  try {
    const user = await apiUser();
    const { server: serverId, session: requested } = await ctx.params;
    const { server, session, row } = await sessionTarget(user, serverId, requested);
    const id = encodeURIComponent(session);
    const [info, messages, status, permissions, questions] = await Promise.all([
      nexocodeJson<{ id: string; title: string }>(server, `/session/${id}`),
      nexocodeJson<unknown[]>(server, `/session/${id}/message`),
      nexocodeJson<Record<string, { type: string }>>(server, "/session/status").catch(() => ({}) as Record<string, { type: string }>),
      nexocodeJson<{ sessionID: string }[]>(server, "/permission").catch(() => []),
      nexocodeJson<{ sessionID: string }[]>(server, "/question").catch(() => []),
    ]);
    return Response.json({
      session: { id: row?.id ?? info.id, title: info.title },
      messages,
      busy: status[info.id]?.type === "busy",
      permissions: permissions.filter((p) => p.sessionID === info.id),
      questions: questions.filter((q) => q.sessionID === info.id),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/code/[server]/sessions/[session]">) {
  try {
    const user = await apiUser();
    const { server: serverId, session } = await ctx.params;
    if (isCloud(serverId)) {
      await deleteSession((await getSessionRow(user.id, session)).id);
      return Response.json({ ok: true });
    }
    const server = await getCodeServer(user, serverId);
    await nexocodeFetch(server, `/session/${encodeURIComponent(session)}`, { method: "DELETE" });
    return Response.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
