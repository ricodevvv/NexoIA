export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { codeExecutionEnabled, warmCache } = await import("@/lib/code-exec");
  if (codeExecutionEnabled()) warmCache();
}
