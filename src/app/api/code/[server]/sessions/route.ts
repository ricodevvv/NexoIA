import { z } from "zod";
import { createSession, getCodeServer, isCloud, nexocodeJson } from "@/lib/nexocode";
import { apiUser, handleError, HttpError } from "@/lib/session";
import { CLOUD_PREFIX, listSessionRows } from "@/lib/workspaces";

type Session = { id: string; title: string; parentID?: string; time: { created: number; updated: number }; summary?: { additions: number; deletions: number; files: number } };

export async function GET(_request: Request, ctx: RouteContext<"/api/code/[server]/sessions">) {
  try {
    const user = await apiUser();
    const serverId = (await ctx.params).server;
    if (isCloud(serverId)) {
      const rows = await listSessionRows(user.id, serverId.slice(CLOUD_PREFIX.length));
      return Response.json(
        rows
          .filter((r) => r.agentSessionId)
          .reverse()
          .map((r) => ({ id: r.id, title: r.title, updated: r.lastActiveAt.getTime(), summary: null })),
      );
    }
    const server = await getCodeServer(user, serverId);
    const sessions = await nexocodeJson<Session[]>(server, "/session");
    return Response.json(
      sessions
        .filter((s) => !s.parentID)
        .sort((a, b) => b.time.updated - a.time.updated)
        .map((s) => ({ id: s.id, title: s.title, updated: s.time.updated, summary: s.summary ?? null })),
    );
  } catch (err) {
    return handleError(err);
  }
}

const Create = z.object({ title: z.string().trim().max(120).optional(), ask: z.boolean().optional() });

export async function POST(request: Request, ctx: RouteContext<"/api/code/[server]/sessions">) {
  try {
    const user = await apiUser();
    const serverId = (await ctx.params).server;
    if (isCloud(serverId)) throw new HttpError(400, "Las sesiones en la nube se crean con /start");
    const server = await getCodeServer(user, serverId);
    const { title, ask } = Create.parse(await request.json().catch(() => ({})));
    const session = await createSession(server, { title, ask });
    return Response.json({ id: session.id, title: session.title });
  } catch (err) {
    return handleError(err);
  }
}
