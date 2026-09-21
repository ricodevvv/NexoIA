import { randomBytes } from "node:crypto";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "@/lib/crypto";
import { db, schema } from "@/lib/db";

type ServerRow = typeof schema.mcpServer.$inferSelect;

type OAuthData = {
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  verifier?: string;
};

export function oauthRedirectUrl() {
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/mcp/oauth/callback`;
}

function read(row: { oauth: string | null }): OAuthData {
  if (!row.oauth) return {};
  try {
    return JSON.parse(decrypt(row.oauth));
  } catch {
    return {};
  }
}

/**
 * Guarda en la base (cifrado) todo lo que el SDK de MCP necesita para OAuth:
 * el registro del cliente, los tokens y el verificador PKCE. El SDK lo usa para
 * autorizar, pedir tokens y renovarlos solo.
 */
export class DbOAuthProvider implements OAuthClientProvider {
  private data: OAuthData;
  authorizationUrl: URL | null = null;

  constructor(private row: ServerRow) {
    this.data = read(row);
  }

  get redirectUrl() {
    return oauthRedirectUrl();
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Nexo",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  async state() {
    const state = randomBytes(24).toString("base64url");
    await db.update(schema.mcpServer).set({ oauthState: state }).where(eq(schema.mcpServer.id, this.row.id));
    return state;
  }

  clientInformation() {
    return this.data.client;
  }

  async saveClientInformation(client: OAuthClientInformationMixed) {
    this.data.client = client;
    await this.persist();
  }

  tokens() {
    return this.data.tokens;
  }

  async saveTokens(tokens: OAuthTokens) {
    this.data.tokens = tokens;
    this.data.verifier = undefined;
    await this.persist();
  }

  redirectToAuthorization(url: URL) {
    this.authorizationUrl = url;
  }

  async saveCodeVerifier(verifier: string) {
    this.data.verifier = verifier;
    await this.persist();
  }

  codeVerifier() {
    if (!this.data.verifier) throw new Error("No hay una autorización en curso para este conector");
    return this.data.verifier;
  }

  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all" || scope === "client") this.data.client = undefined;
    if (scope === "all" || scope === "tokens") this.data.tokens = undefined;
    if (scope === "all" || scope === "verifier") this.data.verifier = undefined;
    await this.persist();
  }

  private async persist() {
    await db.update(schema.mcpServer).set({ oauth: encrypt(JSON.stringify(this.data)) }).where(eq(schema.mcpServer.id, this.row.id));
  }
}

/**
 * Un conector está listo si no usa OAuth o si ya tiene un token de acceso.
 */
export function isConnected(row: { authType: string; oauth: string | null }) {
  return row.authType !== "oauth" || Boolean(read(row).tokens?.access_token);
}
