import type { Instrumentation } from "next";

const IGNORED = ["The destination stream closed early."];

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (err instanceof Error && IGNORED.includes(err.message)) return;
  const { logError } = await import("@/lib/log");
  logError("request", err, { method: request.method, path: request.path, route: context.routePath, type: context.routeType });
};

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { codeExecutionEnabled, warmCache } = await import("@/lib/code-exec");
  if (codeExecutionEnabled()) warmCache();
  const { startWorkspaceReaper } = await import("@/lib/workspaces");
  startWorkspaceReaper();
}
