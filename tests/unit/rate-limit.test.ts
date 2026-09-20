import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { consume } from "@/lib/rate-limit";

const key = `test:${Date.now()}:${Math.random()}`;

afterAll(async () => {
  await db.execute(sql`delete from rate_limit where key like 'test:%'`);
});

describe("consume", () => {
  it("deja pasar hasta el máximo y luego bloquea con tiempo de espera", async () => {
    const rule = { window: 60, max: 3 };
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await consume(key, rule));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
    expect(results[4].retryAfter).toBeGreaterThan(0);
    expect(results[4].retryAfter).toBeLessThanOrEqual(60);
  });

  it("es atómico con peticiones concurrentes", async () => {
    const concurrent = `${key}:c`;
    const results = await Promise.all(Array.from({ length: 20 }, () => consume(concurrent, { window: 60, max: 5 })));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });

  it("reinicia la ventana cuando vence", async () => {
    const short = `${key}:s`;
    await consume(short, { window: 1, max: 1 });
    expect((await consume(short, { window: 1, max: 1 })).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 1100));
    expect((await consume(short, { window: 1, max: 1 })).allowed).toBe(true);
  });
});
