import { isCloud, nexocodeJson, serverFromRequest } from "@/lib/nexocode";
import { apiUser, handleError } from "@/lib/session";

type FileDiff = { file: string; patch: string; additions: number; deletions: number; status: "added" | "modified" | "deleted" };

export async function GET(request: Request, ctx: RouteContext<"/api/code/[server]/diff">) {
  try {
    const user = await apiUser();
    const serverId = (await ctx.params).server;
    if (isCloud(serverId) && !new URL(request.url).searchParams.get("session")) return Response.json([]);
    const server = await serverFromRequest(user, serverId, request);
    const files = await nexocodeJson<FileDiff[]>(server, "/vcs/diff", { query: { mode: "git" } }).catch(() => [] as FileDiff[]);
    return Response.json(files.map((f) => ({ ...f, patch: f.patch.length > 200_000 ? `${f.patch.slice(0, 200_000)}\n…` : f.patch })));
  } catch (err) {
    return handleError(err);
  }
}
