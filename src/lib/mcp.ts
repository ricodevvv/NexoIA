import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { and, eq, isNull, or } from "drizzle-orm";
import type { ToolResult, ToolSpec } from "@/lib/ai/types";
import { decrypt } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import { DbOAuthProvider } from "@/lib/mcp-oauth";
import { assertSafeUrl, safeFetch } from "@/lib/safe-url";

export { assertSafeUrl };

export class NeedsAuthorization extends Error {
  constructor() {
    super("Este conector necesita que lo autorices de nuevo.");
  }
}

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


/**
 * Conecta con un servidor MCP remoto. Prueba primero Streamable HTTP y, si
 * falla, cae a SSE para servidores viejos. Los conectores OAuth usan sus
 * tokens guardados y los renuevan solos; si no hay forma de renovarlos, lanza
 * NeedsAuthorization.
 */
export async function connectServer(row: ServerRow) {
  const url = await assertSafeUrl(row.url);
  const requestInit = { headers: parseHeaders(row) };
  const client = new Client({ name: "nexo", version: "1.0.0" });
  if (row.authType === "oauth") {
    const authProvider = new DbOAuthProvider(row);
    try {
      await client.connect(new StreamableHTTPClientTransport(url, { authProvider, fetch: safeFetch }));
      return client;
    } catch (err) {
      if (err instanceof UnauthorizedError || authProvider.authorizationUrl) throw new NeedsAuthorization();
      throw err;
    }
  }
  try {
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit, fetch: safeFetch }));
    return client;
  } catch {
    const fallback = new Client({ name: "nexo", version: "1.0.0" });
    await fallback.connect(new SSEClientTransport(url, { requestInit, fetch: safeFetch }));
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
 * Abre los servidores MCP activos del usuario, más los compartidos del equipo
 * activo, y junta sus tools con nombres únicos `servidor__tool`.
 */
export async function openToolbox(userId: string, organizationId: string | null): Promise<McpToolbox> {
  const personal = and(eq(schema.mcpServer.userId, userId), isNull(schema.mcpServer.organizationId));
  const rows = await db.query.mcpServer.findMany({
    where: and(
      eq(schema.mcpServer.enabled, true),
      organizationId ? or(personal, eq(schema.mcpServer.organizationId, organizationId)) : personal,
    ),
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
        errors.push(
          err instanceof NeedsAuthorization
            ? `El conector "${row.name}" necesita que lo autorices de nuevo en Ajustes → Conectores.`
            : `No se pudo conectar con "${row.name}": ${(err as Error).message}`,
        );
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
