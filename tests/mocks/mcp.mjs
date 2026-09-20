import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = Number(process.env.MOCK_MCP_PORT ?? 4100);

/**
 * Servidor MCP de prueba con una sola tool, `get_time`, que siempre responde
 * la misma hora para que los tests sean deterministas.
 */
const server = http.createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const mcp = new McpServer({ name: "reloj", version: "1.0.0" });
  mcp.tool("get_time", "Devuelve la hora actual", { zone: z.string().optional() }, async ({ zone }) => ({
    content: [{ type: "text", text: `12:34 ${zone ?? "local"}` }],
  }));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => transport.close());
  await mcp.connect(transport);
  await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock mcp en :${PORT}`));
