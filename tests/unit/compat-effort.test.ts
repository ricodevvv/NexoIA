import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCompatSession } from "@/lib/ai/providers/compat";
import type { ModelInfo, SessionOptions } from "@/lib/ai/types";

const bodies: Record<string, unknown>[] = [];
let server: http.Server;
let base = "";

const sse = (res: http.ServerResponse) => {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const chunk = { id: "1", object: "chat.completion.chunk", created: 0, model: "m", choices: [{ index: 0, delta: { content: "hola" }, finish_reason: "stop" }] };
  res.end(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`);
};

beforeAll(async () => {
  process.env.ALLOW_PRIVATE_MCP = "1";
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw);
      bodies.push(body);
      if (body.model === "rechaza" && "reasoning_effort" in body) {
        res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: { message: "Unrecognized request argument supplied: reasoning_effort" } }));
        return;
      }
      sse(res);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

afterAll(() => server.close());

function options(model: string): SessionOptions {
  const info = { id: `ep:x:${model}`, provider: "compat", label: model, description: "", tier: "free", vision: false, pdf: false, reasoning: "compat", webSearch: null, webFetch: null, fallbacks: false, maxOutput: 100, baseURL: base, endpointId: "x" } as ModelInfo;
  return { model: info, apiKey: "k", system: "s", history: [{ role: "user", parts: [{ type: "text", text: "hola" }] }], attachments: new Map(), tools: [], effort: "high", webSearch: false, research: false } as SessionOptions;
}

async function run(model: string) {
  const step = createCompatSession(options(model)).step(new AbortController().signal);
  let text = "";
  for (let r = await step.next(); !r.done; r = await step.next()) if (r.value.type === "text") text += r.value.delta;
  return text;
}

describe("nivel de pensado en endpoints compatibles", () => {
  it("manda reasoning_effort con el nivel elegido", async () => {
    bodies.length = 0;
    expect(await run("acepta")).toBe("hola");
    expect(bodies[0].reasoning_effort).toBe("high");
  });

  it("si el endpoint lo rechaza, reintenta sin el parámetro y no lo vuelve a mandar", async () => {
    bodies.length = 0;
    expect(await run("rechaza")).toBe("hola");
    expect(bodies.map((b) => "reasoning_effort" in b)).toEqual([true, false]);
    bodies.length = 0;
    await run("rechaza");
    expect(bodies.map((b) => "reasoning_effort" in b)).toEqual([false]);
  });
});
