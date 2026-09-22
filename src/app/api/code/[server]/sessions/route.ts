import { z } from "zod";
import { getCodeServer, nexocodeJson } from "@/lib/nexocode";
import { apiUser, handleError } from "@/lib/session";

type Session = { id: string; title: string; parentID?: string; time: { created: number; updated: number }; summary?: { additions: number; deletions: number; files: number } };

export async function GET(_request: Request, ctx: RouteContext<"/api/code/[server]/sessions">) {
  try {
    const user = await apiUser();
    const server = await getCodeServer(user, (await ctx.params).server);
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

const Create = z.object({ title: z.string().trim().max(120).optional() });

export async function POST(request: Request, ctx: RouteContext<"/api/code/[server]/sessions">) {
  try {
    const user = await apiUser();
    const server = await getCodeServer(user, (await ctx.params).server);
    const { title } = Create.parse(await request.json().catch(() => ({})));
    const session = await nexocodeJson<Session>(server, "/session", { method: "POST", body: JSON.stringify(title ? { title } : {}) });
    return Response.json({ id: session.id, title: session.title });
  } catch (err) {
    return handleError(err);
  }
}
