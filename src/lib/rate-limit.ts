import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";

export type LimitResult = { allowed: boolean; retryAfter: number | null };

/**
 * Cuenta una petición para `key` en una ventana fija de `window` segundos y
 * dice si pasa. Es una sola consulta atómica, así funciona igual con varias
 * instancias del servidor.
 */
export async function consume(key: string, rule: { window: number; max: number }): Promise<LimitResult> {
  const result = await db.execute<{ count: number; elapsed: number }>(sql`
    insert into rate_limit (key, window_start, count) values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limit.window_start < now() - make_interval(secs => ${rule.window}) then 1 else rate_limit.count + 1 end,
      window_start = case when rate_limit.window_start < now() - make_interval(secs => ${rule.window}) then now() else rate_limit.window_start end
    returning count, extract(epoch from now() - window_start)::float as elapsed
  `);
  if (Math.random() < 0.01) {
    db.execute(sql`delete from rate_limit where window_start < now() - interval '1 day'`).catch(() => {});
  }
  const row = result.rows[0];
  if (row.count <= rule.max) return { allowed: true, retryAfter: null };
  return { allowed: false, retryAfter: Math.max(1, Math.ceil(rule.window - row.elapsed)) };
}

export function clientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "desconocida";
}

export class RateLimitError extends HttpError {
  constructor(public retryAfter: number) {
    super(429, `Vas muy rápido. Intenta de nuevo en ${retryAfter < 60 ? `${retryAfter} s` : `${Math.ceil(retryAfter / 60)} min`}.`);
  }
}

type Rule = { key: string; window: number; max: number };

/**
 * Aplica varias reglas a la vez (por usuario, por IP...) y lanza un 429 con la
 * espera más larga si alguna no pasa.
 */
export async function enforce(rules: Rule[]) {
  const results = await Promise.all(rules.map((r) => consume(r.key, r)));
  const blocked = results.filter((r) => !r.allowed);
  if (blocked.length) throw new RateLimitError(Math.max(...blocked.map((r) => r.retryAfter ?? 1)));
}

export const LIMITS = {
  chatUser: { window: 60, max: 30 },
  chatIp: { window: 60, max: 60 },
  upload: { window: 600, max: 60 },
  search: { window: 60, max: 60 },
  connector: { window: 60, max: 20 },
  export: { window: 3600, max: 5 },
  share: { window: 60, max: 120 },
  code: { window: 60, max: 20 },
};
