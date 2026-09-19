import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { lookup } from "node:dns/promises";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import type { ToolResult, ToolSpec } from "@/lib/ai/types";

type ServerRow = typeof schema.mcpServer.$inferSelect;

type ToolEntry = { client: Client; server: string; tool: string };

export type McpToolbox = {
  tools: ToolSpec[];
  errors: string[];
  call(id: string, name: string, input: unknown, signal: AbortSignal): Promise<ToolResult>;
  close(): Promise<void>;
};

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 20) || "mcp";
}

function parseHeaders(row: ServerRow): Record<string, string> {
  if (!row.headers) return {};
  try {
    return JSON.parse(decrypt(row.headers));
  } catch {
    return {};
  }
}

function isPrivateAddress(address: string) {
  if (address === "::1" || address.startsWith("fe80:") || /^f[cd]/i.test(address)) return true;
  const v4 = address.replace(/^::ffff:/, "");
  const [a, b] = v4.split(".").map(Number);
  if ([a, b].some(Number.isNaN)) return false;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * Valida que la URL de un servidor MCP apunte a internet y no a la red interna
 * del servidor. Se puede desactivar con `ALLOW_PRIVATE_MCP=1` para desarrollo.
 */
export async function assertSafeUrl(raw: string) {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("La URL debe ser http o https");
  if (process.env.ALLOW_PRIVATE_MCP === "1") return url;
  if (url.protocol !== "https:") throw new Error("Solo se permiten servidores MCP con https");
  const records = await lookup(url.hostname, { all: true });
  if (records.some((r) => isPrivateAddress(r.address))) throw new Error("La URL apunta a una red privada");
  return url;
}

/**
 * Conecta con un servidor MCP remoto. Prueba primero Streamable HTTP y, si
 * falla, cae a SSE para servidores viejos.
 */
export async function connectServer(row: ServerRow) {
  const url = await assertSafeUrl(row.url);
  const requestInit = { headers: parseHeaders(row) };
  const client = new Client({ name: "nexo", version: "1.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit }));
    return client;
  } catch {
    const fallback = new Client({ name: "nexo", version: "1.0.0" });
    await fallback.connect(new SSEClientTransport(url, { requestInit }));
    return fallback;
  }
}

function resultText(result: Awaited<ReturnType<Client["callTool"]>>) {
  const content = Array.isArray(result.content) ? result.content : [];
  const parts = content.map((c) => {
    if (c.type === "text") return c.text;
    if (c.type === "resource" && "text" in c.resource) return String(c.resource.text);
    return `[${c.type}]`;
  });
  if (result.structuredContent && !parts.length) parts.push(JSON.stringify(result.structuredContent));
  return parts.join("\n") || "OK";
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: tardó más de ${ms / 1000}s`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Abre todos los servidores MCP activos del usuario y junta sus tools con
 * nombres únicos `servidor__tool`.
 */
export async function openToolbox(userId: string): Promise<McpToolbox> {
  const rows = await db.query.mcpServer.findMany({
    where: and(eq(schema.mcpServer.userId, userId), eq(schema.mcpServer.enabled, true)),
  });

  const entries = new Map<string, ToolEntry>();
  const clients: Client[] = [];
  const tools: ToolSpec[] = [];
  const errors: string[] = [];

  await Promise.all(
    rows.map(async (row) => {
      try {
        const client = await withTimeout(connectServer(row), 10_000, row.name);
        clients.push(client);
        const { tools: list } = await withTimeout(client.listTools(), 10_000, row.name);
        const prefix = slug(row.name);
        for (const tool of list) {
          const name = `${prefix}__${tool.name}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
          entries.set(name, { client, server: row.name, tool: tool.name });
          tools.push({
            name,
            description: `[${row.name}] ${tool.description ?? tool.name}`,
            inputSchema: (tool.inputSchema ?? {}) as Record<string, unknown>,
          });
        }
      } catch (err) {
        errors.push(`No se pudo conectar con "${row.name}": ${(err as Error).message}`);
      }
    }),
  );

  async function call(id: string, name: string, input: unknown, signal: AbortSignal): Promise<ToolResult> {
    const entry = entries.get(name);
    if (!entry) return { id, name, output: `La tool ${name} no existe`, isError: true };
    try {
      const result = await entry.client.callTool(
        { name: entry.tool, arguments: (input ?? {}) as Record<string, unknown> },
        undefined,
        { signal, timeout: 120_000 },
      );
      return { id, name, output: resultText(result).slice(0, 100_000), isError: Boolean(result.isError) };
    } catch (err) {
      return { id, name, output: `Error: ${(err as Error).message}`, isError: true };
    }
  }

  async function close() {
    await Promise.allSettled(clients.map((c) => c.close()));
  }

  return { tools, errors, call, close };
}
