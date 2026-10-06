import { listModels } from "@/lib/ai/models";
import { listLogs, parseRange, RANGES, SOURCE_LABEL } from "@/lib/platform/analytics";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { apiUser, handleError } from "@/lib/session";

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Descarga en CSV las peticiones del rango elegido (hasta 10 000 filas).
 */
export async function GET(request: Request) {
  try {
    const user = await apiUser();
    await enforce([{ key: `export:usage:${user.id}`, ...LIMITS.export }]);
    const range = parseRange(new URL(request.url).searchParams.get("range"));
    const since = new Date(Date.now() - RANGES[range] * 86_400_000);
    const labels = new Map(listModels().map((m) => [m.id, m.label]));
    const rows: string[][] = [];
    let before: Date | undefined;
    while (rows.length < 10_000) {
      const page = await listLogs(user.id, { before, limit: 200 });
      const inRange = page.filter((r) => new Date(r.createdAt) >= since);
      for (const r of inRange) {
        rows.push([
          r.createdAt,
          r.model,
          labels.get(r.model) ?? r.model,
          SOURCE_LABEL[r.source],
          r.status,
          String(r.inputTokens),
          String(r.outputTokens),
          r.latencyMs === null ? "" : String(r.latencyMs),
          r.cost === null ? "" : r.cost.toFixed(6),
          r.byok ? "si" : "no",
          r.error ?? "",
        ]);
      }
      if (page.length < 200 || inRange.length < page.length) break;
      before = new Date(page.at(-1)!.createdAt);
    }
    const header = ["fecha", "modelo", "nombre", "origen", "estado", "tokens_entrada", "tokens_salida", "latencia_ms", "costo_usd", "key_propia", "error"];
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="nexo-uso-${range}.csv"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
