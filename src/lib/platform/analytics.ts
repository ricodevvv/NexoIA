import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { estimateCost, pricingFor } from "@/lib/ai/models";
import { db, schema } from "@/lib/db";

import { SOURCE_LABEL, type Source } from "./analytics-labels";

export { SOURCE_LABEL, type Source };

export const RANGES = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 } as const;
export type RangeId = keyof typeof RANGES;

export function parseRange(value: unknown, fallback: RangeId = "30d"): RangeId {
  return typeof value === "string" && value in RANGES ? (value as RangeId) : fallback;
}

export type Totals = {
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  avgLatencyMs: number | null;
};

export type DayPoint = Totals & { day: string; bySource: Record<Source, number> };

export type Breakdown = Totals & { key: string; label: string };

type Row = {
  day: string;
  model: string;
  source: Source;
  apiKeyId: string | null;
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  latencySum: number;
  latencyCount: number;
};

type Scope = { userId: string } | { userIds: string[] };

function scopeWhere(scope: Scope) {
  if ("userId" in scope) return eq(schema.usage.userId, scope.userId);
  return scope.userIds.length ? inArray(schema.usage.userId, scope.userIds) : sql`false`;
}

function emptyTotals(): Totals {
  return { requests: 0, errors: 0, inputTokens: 0, outputTokens: 0, cost: 0, avgLatencyMs: null };
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Trae el uso agregado por día, modelo, origen y key en una sola consulta.
 * Todo lo demás (series, desgloses, costos) se arma en memoria con esto.
 */
async function aggregate(scope: Scope, from: Date, to: Date): Promise<Row[]> {
  const day = sql<string>`to_char(date_trunc('day', ${schema.usage.createdAt}), 'YYYY-MM-DD')`;
  return db
    .select({
      day,
      model: schema.usage.model,
      source: schema.usage.source,
      apiKeyId: schema.usage.apiKeyId,
      requests: sql<number>`count(*)`.mapWith(Number),
      errors: sql<number>`count(*) filter (where ${schema.usage.status} = 'error')`.mapWith(Number),
      inputTokens: sql<number>`coalesce(sum(${schema.usage.inputTokens}), 0)`.mapWith(Number),
      outputTokens: sql<number>`coalesce(sum(${schema.usage.outputTokens}), 0)`.mapWith(Number),
      latencySum: sql<number>`coalesce(sum(${schema.usage.latencyMs}), 0)`.mapWith(Number),
      latencyCount: sql<number>`count(${schema.usage.latencyMs})`.mapWith(Number),
    })
    .from(schema.usage)
    .where(and(scopeWhere(scope), gte(schema.usage.createdAt, from), lt(schema.usage.createdAt, to)))
    .groupBy(day, schema.usage.model, schema.usage.source, schema.usage.apiKeyId);
}

type Acc = Totals & { latencySum: number; latencyCount: number };

function add(acc: Acc, row: Row) {
  acc.requests += row.requests;
  acc.errors += row.errors;
  acc.inputTokens += row.inputTokens;
  acc.outputTokens += row.outputTokens;
  acc.cost += estimateCost(pricingFor(row.model), row) ?? 0;
  acc.latencySum += row.latencySum;
  acc.latencyCount += row.latencyCount;
}

function finish({ latencySum, latencyCount, ...totals }: Acc): Totals {
  return { ...totals, avgLatencyMs: latencyCount ? Math.round(latencySum / latencyCount) : null };
}

function newAcc(): Acc {
  return { ...emptyTotals(), latencySum: 0, latencyCount: 0 };
}

function group(rows: Row[], keyOf: (r: Row) => string) {
  const map = new Map<string, Acc>();
  for (const row of rows) {
    const key = keyOf(row);
    const acc = map.get(key) ?? newAcc();
    add(acc, row);
    map.set(key, acc);
  }
  return map;
}

export type UsageReport = {
  range: RangeId;
  from: string;
  to: string;
  totals: Totals;
  previous: Totals;
  series: DayPoint[];
  byModel: Breakdown[];
  bySource: Breakdown[];
  byKey: Breakdown[];
};

/**
 * Reporte de uso para un rango: totales contra el periodo anterior, serie
 * diaria por origen y desgloses por modelo, origen y key.
 */
export async function usageReport(
  scope: Scope,
  range: RangeId,
  labels: { model: (id: string) => string; key: (id: string | null) => string },
): Promise<UsageReport> {
  const days = RANGES[range];
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const prevFrom = new Date(from.getTime() - days * 86_400_000);
  const [rows, prevRows] = await Promise.all([aggregate(scope, from, to), aggregate(scope, prevFrom, from)]);

  const total = newAcc();
  for (const row of rows) add(total, row);
  const prev = newAcc();
  for (const row of prevRows) add(prev, row);

  const byDay = new Map<string, { acc: Acc; bySource: Record<Source, number> }>();
  const start = new Date(from);
  start.setUTCHours(0, 0, 0, 0);
  for (let d = new Date(start); d <= to; d = new Date(d.getTime() + 86_400_000)) {
    byDay.set(dayKey(d), { acc: newAcc(), bySource: { chat: 0, api: 0, playground: 0, code: 0 } });
  }
  for (const row of rows) {
    const bucket = byDay.get(row.day);
    if (!bucket) continue;
    add(bucket.acc, row);
    bucket.bySource[row.source] += row.requests;
  }

  const breakdown = (map: Map<string, Acc>, label: (key: string) => string) =>
    [...map.entries()]
      .map(([key, acc]) => ({ key, label: label(key), ...finish(acc) }))
      .sort((a, b) => b.requests - a.requests);

  return {
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    totals: finish(total),
    previous: finish(prev),
    series: [...byDay.entries()].map(([day, { acc, bySource }]) => ({ day, bySource, ...finish(acc) })),
    byModel: breakdown(group(rows, (r) => r.model), labels.model),
    bySource: breakdown(group(rows, (r) => r.source), (s) => SOURCE_LABEL[s as Source] ?? s),
    byKey: breakdown(
      group(rows.filter((r) => r.apiKeyId), (r) => r.apiKeyId!),
      (id) => labels.key(id),
    ),
  };
}

export type LogFilters = { source?: Source; model?: string; status?: "ok" | "error"; before?: Date; limit?: number };

export type LogRow = {
  id: string;
  createdAt: string;
  model: string;
  source: Source;
  status: "ok" | "error";
  error: string | null;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number | null;
  cost: number | null;
  byok: boolean;
  apiKeyId: string | null;
  conversationId: string | null;
};

/**
 * Últimas peticiones del usuario, filtrables y paginadas hacia atrás.
 */
export async function listLogs(userId: string, filters: LogFilters = {}): Promise<LogRow[]> {
  const limit = Math.min(filters.limit ?? 50, 200);
  const rows = await db
    .select()
    .from(schema.usage)
    .where(
      and(
        eq(schema.usage.userId, userId),
        filters.source ? eq(schema.usage.source, filters.source) : undefined,
        filters.model ? eq(schema.usage.model, filters.model) : undefined,
        filters.status ? eq(schema.usage.status, filters.status) : undefined,
        filters.before ? lt(schema.usage.createdAt, filters.before) : undefined,
      ),
    )
    .orderBy(desc(schema.usage.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    model: r.model,
    source: r.source,
    status: r.status,
    error: r.error,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    latencyMs: r.latencyMs,
    cost: estimateCost(pricingFor(r.model), r),
    byok: r.byok,
    apiKeyId: r.apiKeyId,
    conversationId: r.conversationId,
  }));
}

/**
 * Modelos que el usuario usó alguna vez, para el filtro de los logs.
 */
export async function usedModels(userId: string) {
  const rows = await db.selectDistinct({ model: schema.usage.model }).from(schema.usage).where(eq(schema.usage.userId, userId));
  return rows.map((r) => r.model).sort();
}

/**
 * Totales por persona (peticiones, tokens y costo) para el panel del equipo.
 */
export async function usageByUser(userIds: string[], days: number) {
  if (!userIds.length) return new Map<string, Totals>();
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({
      userId: schema.usage.userId,
      model: schema.usage.model,
      requests: sql<number>`count(*)`.mapWith(Number),
      errors: sql<number>`count(*) filter (where ${schema.usage.status} = 'error')`.mapWith(Number),
      inputTokens: sql<number>`coalesce(sum(${schema.usage.inputTokens}), 0)`.mapWith(Number),
      outputTokens: sql<number>`coalesce(sum(${schema.usage.outputTokens}), 0)`.mapWith(Number),
      latencySum: sql<number>`coalesce(sum(${schema.usage.latencyMs}), 0)`.mapWith(Number),
      latencyCount: sql<number>`count(${schema.usage.latencyMs})`.mapWith(Number),
    })
    .from(schema.usage)
    .where(and(inArray(schema.usage.userId, userIds), gte(schema.usage.createdAt, since)))
    .groupBy(schema.usage.userId, schema.usage.model);
  const map = new Map<string, Acc>();
  for (const row of rows) {
    const acc = map.get(row.userId) ?? newAcc();
    add(acc, { ...row, day: "", source: "chat", apiKeyId: null });
    map.set(row.userId, acc);
  }
  return new Map([...map.entries()].map(([id, acc]) => [id, finish(acc)]));
}
