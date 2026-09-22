import { getCodeServer, nexocodeJson } from "@/lib/nexocode";
import { apiUser, handleError } from "@/lib/session";

type FileDiff = { file: string; patch: string; additions: number; deletions: number; status: "added" | "modified" | "deleted" };

export async function GET(_request: Request, ctx: RouteContext<"/api/code/[server]/diff">) {
  try {
    const user = await apiUser();
    const server = await getCodeServer(user, (await ctx.params).server);
    const files = await nexocodeJson<FileDiff[]>(server, "/vcs/diff", { query: { mode: "git" } }).catch(() => [] as FileDiff[]);
    return Response.json(files.map((f) => ({ ...f, patch: f.patch.length > 200_000 ? `${f.patch.slice(0, 200_000)}\n…` : f.patch })));
  } catch (err) {
    return handleError(err);
  }
}
