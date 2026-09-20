type Extra = Record<string, unknown>;

function serialize(err: unknown) {
  if (err instanceof Error) {
    const digest = (err as { digest?: string }).digest;
    return { message: err.message, name: err.name, stack: err.stack?.split("\n").slice(0, 8).join("\n"), ...(digest ? { digest } : {}) };
  }
  return { message: String(err) };
}

/**
 * Registra un error como una línea JSON en stderr (lo recoge journald o el
 * colector de logs que uses) y, si hay ERROR_WEBHOOK_URL, lo avisa ahí también.
 */
export function logError(event: string, err: unknown, extra: Extra = {}) {
  const entry = { level: "error", time: new Date().toISOString(), event, ...extra, error: serialize(err) };
  console.error(JSON.stringify(entry));
  const webhook = process.env.ERROR_WEBHOOK_URL;
  if (!webhook) return;
  const text = `⚠️ Nexo · ${event}: ${entry.error.message}`.slice(0, 1800);
  fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, content: text }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

export function logInfo(event: string, extra: Extra = {}) {
  console.log(JSON.stringify({ level: "info", time: new Date().toISOString(), event, ...extra }));
}
