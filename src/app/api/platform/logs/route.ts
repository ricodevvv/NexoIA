import { listLogs, type Source } from "@/lib/platform/analytics";
import { apiUser, handleError } from "@/lib/session";

const SOURCES = new Set(["chat", "api", "playground", "code"]);

/**
 * Página siguiente de logs con los mismos filtros que la vista.
 */
export async function GET(request: Request) {
  try {
    const user = await apiUser();
    const params = new URL(request.url).searchParams;
    const source = params.get("source");
    const status = params.get("status");
    const before = params.get("before");
    const rows = await listLogs(user.id, {
      source: source && SOURCES.has(source) ? (source as Source) : undefined,
      model: params.get("model") || undefined,
      status: status === "ok" || status === "error" ? status : undefined,
      before: before ? new Date(before) : undefined,
      limit: 50,
    });
    return Response.json(rows);
  } catch (err) {
    return handleError(err);
  }
}
