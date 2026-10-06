import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { groupByDate } from "@/components/group-by-date";
import { estimateCost, pricingFor } from "@/lib/ai/models";
import { auditCategory, auditLabel } from "@/lib/audit-labels";
import { db, schema } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { listLogs, usageReport } from "@/lib/platform/analytics";
import { authenticateKey, createKey, generateKey, hashKey, KEY_PREFIX, listKeys, revokeKey } from "@/lib/platform/keys";
import { chunkBody, completionBody, effortFrom, errorBody, toHistory } from "@/lib/platform/openai-format";
import { fillVariables, promptVariables } from "@/lib/platform/prompt-text";
import { buildSnippet } from "@/lib/platform/snippets";

const userId = `test-platform-${Date.now()}`;

beforeAll(async () => {
  await db.insert(schema.user).values({ id: userId, name: "Prueba", email: `${userId}@test.dev` });
});

afterAll(async () => {
  await db.delete(schema.user).where(eq(schema.user.id, userId));
});

describe("toHistory", () => {
  it("junta system y developer, y une mensajes seguidos del mismo rol", () => {
    const { system, history } = toHistory([
      { role: "system", content: "Sé breve." },
      { role: "developer", content: [{ type: "text", text: "Responde en español." }] },
      { role: "user", content: "Hola" },
      { role: "user", content: "¿Cómo estás?" },
    ]);
    expect(system).toBe("Sé breve.\n\nResponde en español.");
    expect(history).toHaveLength(1);
    expect(history[0].parts.map((p) => (p.type === "text" ? p.text : ""))).toEqual(["Hola", "¿Cómo estás?"]);
  });

  it("convierte imágenes en data URL a adjuntos", () => {
    const png = Buffer.from("fake").toString("base64");
    const { history, attachments } = toHistory([
      { role: "user", content: [{ type: "text", text: "¿Qué es?" }, { type: "image_url", image_url: { url: `data:image/png;base64,${png}` } }] },
    ]);
    expect(attachments.size).toBe(1);
    const part = history[0].parts[1];
    expect(part.type).toBe("attachment");
    expect(attachments.get("img-1")?.data.toString()).toBe("fake");
  });

  it("rechaza URLs externas y conversaciones que no terminan en user", () => {
    expect(() => toHistory([{ role: "user", content: [{ type: "image_url", image_url: { url: "https://x.com/a.png" } }] }])).toThrow(HttpError);
    expect(() =>
      toHistory([
        { role: "user", content: "Hola" },
        { role: "assistant", content: "Hola" },
      ]),
    ).toThrow(/último mensaje/);
    expect(() => toHistory([{ role: "assistant", content: "Hola" }])).toThrow(/empezar/);
  });
});

describe("formato OpenAI", () => {
  it("mapea el esfuerzo y arma respuestas, chunks y errores", () => {
    expect(effortFrom(undefined)).toBe("medium");
    expect(effortFrom("minimal")).toBe("low");
    expect(effortFrom("xhigh")).toBe("xhigh");

    const body = completionBody({ id: "c1", model: "m", text: "hola", reasoning: "", usage: { inputTokens: 3, outputTokens: 4 }, truncated: true });
    expect(body.choices[0]).toMatchObject({ message: { role: "assistant", content: "hola" }, finish_reason: "length" });
    expect(body.usage).toEqual({ prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 });

    expect(chunkBody({ id: "c1", model: "m", delta: { content: "x" } }).choices[0].delta).toEqual({ content: "x" });
    expect(chunkBody({ id: "c1", model: "m", usage: { inputTokens: 1, outputTokens: 1 } }).choices).toEqual([]);
    expect(errorBody(401, "no").error.type).toBe("authentication_error");
    expect(errorBody(402, "límite").error.code).toBe("insufficient_quota");
  });
});

describe("API keys", () => {
  it("genera keys con prefijo y guarda solo el hash", () => {
    const a = generateKey();
    const b = generateKey();
    expect(a.key.startsWith(KEY_PREFIX)).toBe(true);
    expect(a.key).not.toBe(b.key);
    expect(a.hash).toBe(hashKey(a.key));
    expect(a.prefix).toContain("…");
    expect(a.prefix).not.toContain(a.key.slice(14, 30));
  });

  it("autentica, cuenta en el listado y deja de servir al revocar", async () => {
    const { key, row } = await createKey(userId, "Pruebas", 30);
    const headers = new Headers({ authorization: `Bearer ${key}` });
    const auth = await authenticateKey(headers);
    expect(auth.user.id).toBe(userId);
    expect(auth.key.id).toBe(row.id);
    expect((await authenticateKey(new Headers({ "x-api-key": key }))).key.id).toBe(row.id);

    const listed = await listKeys(userId);
    expect(listed.find((k) => k.id === row.id)?.expiresAt).not.toBeNull();

    await revokeKey(userId, row.id);
    await expect(authenticateKey(headers)).rejects.toThrow(/revocada/);
    await expect(authenticateKey(new Headers())).rejects.toThrow(/Falta/);
    await expect(authenticateKey(new Headers({ authorization: "Bearer sk-otra" }))).rejects.toThrow(/no es de Nexo/);
  });
});

describe("analítica de uso", () => {
  it("suma peticiones, tokens, errores y costo por modelo y origen", async () => {
    const now = new Date();
    await db.insert(schema.usage).values([
      { id: `${userId}-1`, userId, model: "claude-opus-5-5", inputTokens: 1_000_000, outputTokens: 0, source: "chat", latencyMs: 1000, createdAt: now },
      { id: `${userId}-2`, userId, model: "claude-opus-5-5", inputTokens: 0, outputTokens: 1_000_000, source: "api", latencyMs: 3000, createdAt: now },
      { id: `${userId}-3`, userId, model: "claude-haiku-4-5", inputTokens: 10, outputTokens: 0, source: "api", status: "error", error: "x", createdAt: now },
    ]);
    const report = await usageReport({ userId }, "7d", { model: (id) => id, key: () => "k" });
    expect(report.totals.requests).toBe(3);
    expect(report.totals.errors).toBe(1);
    expect(report.totals.cost).toBeCloseTo(24 + 0.00001);
    expect(report.totals.avgLatencyMs).toBe(2000);
    expect(report.byModel[0]).toMatchObject({ key: "claude-opus-5-5", requests: 2 });
    expect(report.bySource.find((s) => s.key === "api")?.requests).toBe(2);
    expect(report.series.at(-1)?.bySource.api).toBe(2);

    const errors = await listLogs(userId, { status: "error" });
    expect(errors).toHaveLength(1);
    expect(errors[0].model).toBe("claude-haiku-4-5");
  });
});

describe("precios", () => {
  it("estima el costo con el precio por millón de tokens", () => {
    expect(estimateCost(pricingFor("claude-sonnet-5-5"), { inputTokens: 500_000, outputTokens: 100_000 })).toBeCloseTo(2);
    expect(estimateCost(pricingFor("compat:desconocido"), { inputTokens: 10, outputTokens: 10 })).toBeNull();
  });
});

describe("prompts", () => {
  it("encuentra variables y las reemplaza", () => {
    expect(promptVariables("Hola {{ nombre }}", "{{nombre}} vive en {{ciudad}}")).toEqual(["nombre", "ciudad"]);
    expect(fillVariables("Hola {{nombre}} de {{ciudad}}", { nombre: "Ana" })).toBe("Hola Ana de {{ciudad}}");
  });

  it("arma el mismo ejemplo en curl, Python y TypeScript", () => {
    const input = { baseUrl: "https://nexo.dev/api/v1", model: "claude-opus-5-5", system: "Sé breve", messages: [{ role: "user" as const, content: "It's \"ok\"" }], stream: true };
    const curl = buildSnippet("curl", input);
    expect(curl).toContain("https://nexo.dev/api/v1/chat/completions");
    expect(curl).toContain("It'\\''s");
    expect(buildSnippet("python", input)).toContain("stream=True");
    expect(buildSnippet("typescript", input)).toContain('baseURL: "https://nexo.dev/api/v1"');
  });
});

describe("agrupar chats por fecha", () => {
  it("pone cada chat en su grupo y omite los vacíos", () => {
    const now = new Date("2026-10-06T15:00:00");
    const at = (days: number) => ({ updatedAt: new Date(now.getTime() - days * 86_400_000).toISOString() });
    const groups = groupByDate([at(0), at(1), at(3), at(20), at(90)], now);
    expect(groups.map((g) => [g.title, g.items.length])).toEqual([
      ["Hoy", 1],
      ["Ayer", 1],
      ["Últimos 7 días", 1],
      ["Últimos 30 días", 1],
      ["Anteriores", 1],
    ]);
    expect(groupByDate([at(0)], now).map((g) => g.title)).toEqual(["Hoy"]);
  });
});

describe("bitácora", () => {
  it("da nombre y categoría a cada acción", () => {
    expect(auditLabel("platform_key.created")).toBe("Creó una API key");
    expect(auditCategory("platform_key.revoked")).toBe("keys");
    expect(auditCategory("member.invited")).toBe("team");
    expect(auditCategory("auth.sign_in")).toBe("auth");
    expect(auditLabel("algo.raro")).toBe("algo.raro");
  });
});
