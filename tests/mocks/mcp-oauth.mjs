import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const PORT = Number(process.env.MOCK_OAUTH_PORT ?? 4120);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN_TTL = Number(process.env.MOCK_OAUTH_TTL ?? 5);

const clients = new Map();
const codes = new Map();
const accessTokens = new Map();
const refreshTokens = new Set();
const stats = { issued: 0, refreshed: 0 };

const token = () => randomBytes(18).toString("base64url");

function json(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

function issue() {
  const access = token();
  const refresh = token();
  accessTokens.set(access, Date.now() + TOKEN_TTL * 1000);
  refreshTokens.add(refresh);
  return { access_token: access, token_type: "Bearer", expires_in: TOKEN_TTL, refresh_token: refresh };
}

/**
 * Servidor MCP protegido con OAuth 2.1 para los tests: metadatos del recurso y
 * del servidor de autorización, registro dinámico de clientes, PKCE S256,
 * tokens que vencen rápido y refresh. Aprueba la autorización sin pantalla.
 */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const path = url.pathname;

  if (path.startsWith("/.well-known/oauth-protected-resource")) {
    return json(res, 200, { resource: `${BASE}/mcp`, authorization_servers: [BASE] });
  }
  if (path === "/.well-known/oauth-authorization-server") {
    return json(res, 200, {
      issuer: BASE,
      authorization_endpoint: `${BASE}/authorize`,
      token_endpoint: `${BASE}/token`,
      registration_endpoint: `${BASE}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  }
  if (path === "/stats") return json(res, 200, stats);
  if (path === "/register" && req.method === "POST") {
    const meta = JSON.parse(await readBody(req));
    const client = { ...meta, client_id: `c_${token()}`, client_id_issued_at: Math.floor(Date.now() / 1000) };
    clients.set(client.client_id, client);
    return json(res, 201, client);
  }
  if (path === "/authorize") {
    const client = clients.get(url.searchParams.get("client_id"));
    const redirect = url.searchParams.get("redirect_uri");
    if (!client || !client.redirect_uris.includes(redirect)) return json(res, 400, { error: "invalid_client" });
    if (url.searchParams.get("code_challenge_method") !== "S256") return json(res, 400, { error: "invalid_request" });
    const code = token();
    codes.set(code, { clientId: client.client_id, challenge: url.searchParams.get("code_challenge"), redirect });
    const back = new URL(redirect);
    back.searchParams.set("code", code);
    back.searchParams.set("state", url.searchParams.get("state") ?? "");
    res.writeHead(302, { Location: back.href });
    return res.end();
  }
  if (path === "/token" && req.method === "POST") {
    const form = new URLSearchParams(await readBody(req));
    if (form.get("grant_type") === "authorization_code") {
      const entry = codes.get(form.get("code"));
      codes.delete(form.get("code"));
      const verifier = form.get("code_verifier") ?? "";
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      if (!entry || entry.challenge !== challenge || entry.clientId !== form.get("client_id")) {
        return json(res, 400, { error: "invalid_grant" });
      }
      stats.issued++;
      return json(res, 200, issue());
    }
    if (form.get("grant_type") === "refresh_token") {
      const refresh = form.get("refresh_token");
      if (!refreshTokens.has(refresh)) return json(res, 400, { error: "invalid_grant" });
      refreshTokens.delete(refresh);
      stats.refreshed++;
      return json(res, 200, issue());
    }
    return json(res, 400, { error: "unsupported_grant_type" });
  }
  if (path === "/mcp") {
    const bearer = req.headers.authorization?.replace(/^Bearer /, "");
    const expires = bearer ? accessTokens.get(bearer) : undefined;
    if (!expires || expires < Date.now()) {
      res.writeHead(401, { "WWW-Authenticate": `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp"` });
      return res.end();
    }
    const body = await readBody(req);
    const mcp = new McpServer({ name: "privado", version: "1.0.0" });
    mcp.tool("whoami", "Dice quién está conectado", {}, async () => ({ content: [{ type: "text", text: "usuario autenticado por OAuth" }] }));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => transport.close());
    await mcp.connect(transport);
    return transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
  }
  json(res, 404, { error: "not_found" });
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock mcp oauth en :${PORT}`));
