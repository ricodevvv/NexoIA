import { randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { logError } from "@/lib/log";

export const GITHUB_STATE_COOKIE = "nexo_gh_state";

const API = "https://api.github.com";
const REFRESH_MARGIN_MS = 5 * 60_000;
const MAX_REPOS = 500;

type Connection = typeof schema.githubConnection.$inferSelect;

export type Installation = {
  id: number;
  account: string;
  type: "User" | "Organization";
  avatarUrl: string;
  selection: "all" | "selected";
  settingsUrl: string;
};

export type Repo = { fullName: string; private: boolean; defaultBranch: string; canPush: boolean; description: string | null };

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
};

/**
 * Arma el `state` de un viaje a GitHub, atado al usuario, y el valor de la
 * cookie donde se guarda para comprobarlo al volver.
 */
export function newState(userId: string) {
  const state = randomBytes(24).toString("base64url");
  return { state, cookie: `${state}.${userId}` };
}

/**
 * Comprueba que el `state` que volvió de GitHub sea el de la cookie y que la
 * cookie sea del usuario con sesión.
 */
export function stateMatches(request: Request, state: string, userId: string) {
  const raw = request.headers.get("cookie")?.match(new RegExp(`${GITHUB_STATE_COOKIE}=([^;]+)`))?.[1] ?? "";
  const [expected, owner] = decodeURIComponent(raw).split(".");
  if (!expected || owner !== userId) return false;
  const a = Buffer.from(state);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type AppConfig = { slug: string; clientId: string; clientSecret: string };

const CONFIG_KEY = "github_app";
let configCache: { value: AppConfig | null; until: number } | null = null;

/**
 * Las credenciales de la GitHub App: las de las variables `GITHUB_APP_*` si
 * están, o las que se guardaron cifradas al crear la app desde Nexo.
 */
export async function githubApp(): Promise<AppConfig | null> {
  const { GITHUB_APP_SLUG: slug, GITHUB_APP_CLIENT_ID: clientId, GITHUB_APP_CLIENT_SECRET: clientSecret } = process.env;
  if (slug && clientId && clientSecret) return { slug, clientId, clientSecret };
  if (configCache && configCache.until > Date.now()) return configCache.value;
  const row = await db.query.appConfig.findFirst({ where: eq(schema.appConfig.key, CONFIG_KEY) });
  const value = row ? (JSON.parse(decrypt(row.value)) as AppConfig) : null;
  configCache = { value, until: Date.now() + 60_000 };
  return value;
}

/**
 * La integración usa una GitHub App (no la OAuth App del login): el usuario la
 * instala en su cuenta y en sus organizaciones y elige qué repos comparte.
 */
export async function githubAppEnabled() {
  return Boolean(await githubApp());
}

async function requireApp() {
  const app = await githubApp();
  if (!app) throw new HttpError(404, "La integración con GitHub no está configurada en este servidor.");
  return app;
}

/**
 * Quién puede crear la GitHub App desde Nexo: los emails de
 * `NEXO_ADMIN_EMAILS`, y solo mientras la app no exista.
 */
export function isGithubAdmin(email: string) {
  return (process.env.NEXO_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

function publicBase() {
  return (process.env.NEXO_PUBLIC_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

function callbackUrl() {
  return `${publicBase()}/api/github/callback`;
}

/**
 * El manifest con el que GitHub crea la app ya configurada: URLs de vuelta,
 * permisos para clonar, hacer push, abrir pull requests e issues, y sin
 * webhook.
 */
export function appManifest() {
  const base = publicBase();
  return {
    name: `Nexo ${new URL(base).hostname.split(".")[0]}`.slice(0, 34),
    url: base,
    hook_attributes: { url: `${base}/api/github/webhook`, active: false },
    redirect_url: `${base}/api/github/app/callback`,
    callback_urls: [callbackUrl()],
    setup_url: callbackUrl(),
    setup_on_update: true,
    request_oauth_on_install: false,
    public: true,
    default_permissions: { contents: "write", pull_requests: "write", issues: "write", workflows: "write", metadata: "read" },
    default_events: [],
  };
}

/**
 * Cambia el código que devuelve GitHub al crear la app por sus credenciales y
 * las guarda cifradas. No pide autenticación: el código solo lo tiene quien
 * creó la app y sirve una vez.
 */
export async function saveAppFromManifest(code: string) {
  const res = await fetch(`${API}/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: "POST",
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "nexo" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new HttpError(502, `GitHub respondió ${res.status} al crear la app`);
  const data = (await res.json()) as { slug: string; client_id: string; client_secret: string };
  const value = encrypt(JSON.stringify({ slug: data.slug, clientId: data.client_id, clientSecret: data.client_secret }));
  await db
    .insert(schema.appConfig)
    .values({ key: CONFIG_KEY, value })
    .onConflictDoUpdate({ target: schema.appConfig.key, set: { value, updatedAt: new Date() } });
  configCache = null;
  return data.slug;
}

export async function authorizeUrl(state: string) {
  const app = await requireApp();
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("redirect_uri", callbackUrl());
  url.searchParams.set("state", state);
  return url.toString();
}

export async function installUrl(state: string) {
  const app = await requireApp();
  const url = new URL(`https://github.com/apps/${app.slug}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "nexo",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) throw new HttpError(409, "GitHub rechazó la conexión. Vuelve a conectarla en Ajustes → GitHub.");
  if (!res.ok) throw new HttpError(502, `GitHub respondió ${res.status}`);
  return res.json() as Promise<T>;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const app = await requireApp();
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: app.clientId, client_secret: app.clientSecret, ...params }),
    signal: AbortSignal.timeout(15_000),
  });
  return (await res.json().catch(() => ({ error: `http_${res.status}` }))) as TokenResponse;
}

function expiry(seconds?: number) {
  return seconds ? new Date(Date.now() + seconds * 1000) : null;
}

/**
 * Cambia el código que manda GitHub por tokens y guarda la conexión cifrada.
 * Si el usuario ya tenía otra cuenta conectada, la reemplaza.
 */
export async function connectWithCode(userId: string, code: string) {
  const tokens = await tokenRequest({ code, redirect_uri: callbackUrl() });
  if (!tokens.access_token) throw new HttpError(400, tokens.error_description ?? "GitHub no entregó el token");
  const me = await api<{ id: number; login: string; avatar_url: string }>(tokens.access_token, "/user");
  const values = {
    githubId: me.id,
    login: me.login,
    avatarUrl: me.avatar_url,
    accessToken: encrypt(tokens.access_token),
    accessExpiresAt: expiry(tokens.expires_in),
    refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
    refreshExpiresAt: expiry(tokens.refresh_token_expires_in),
    updatedAt: new Date(),
  };
  await db
    .insert(schema.githubConnection)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: schema.githubConnection.userId, set: values });
  return me.login;
}

export async function githubConnection(userId: string) {
  return (await db.query.githubConnection.findFirst({ where: eq(schema.githubConnection.userId, userId) })) ?? null;
}

const refreshing = new Map<string, Promise<string>>();

async function refresh(conn: Connection) {
  if (!conn.refreshToken) throw new HttpError(409, "La conexión con GitHub venció. Vuelve a conectarla en Ajustes → GitHub.");
  const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: decrypt(conn.refreshToken) });
  if (!tokens.access_token) {
    logError("github", new Error(tokens.error ?? "refresh sin token"), { user: conn.userId });
    await db.delete(schema.githubConnection).where(eq(schema.githubConnection.userId, conn.userId));
    throw new HttpError(409, "La conexión con GitHub venció. Vuelve a conectarla en Ajustes → GitHub.");
  }
  await db
    .update(schema.githubConnection)
    .set({
      accessToken: encrypt(tokens.access_token),
      accessExpiresAt: expiry(tokens.expires_in),
      refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : conn.refreshToken,
      refreshExpiresAt: tokens.refresh_token_expires_in ? expiry(tokens.refresh_token_expires_in) : conn.refreshExpiresAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.githubConnection.userId, conn.userId));
  return tokens.access_token;
}

/**
 * Devuelve un token de usuario vigente, renovándolo si le quedan menos de
 * cinco minutos. Es un token de la GitHub App a nombre del usuario, así que
 * solo alcanza los repos donde la app está instalada y el usuario tiene
 * permiso.
 */
export async function githubToken(userId: string) {
  const conn = await githubConnection(userId);
  if (!conn) throw new HttpError(404, "No hay una cuenta de GitHub conectada. Conéctala en Ajustes → GitHub.");
  if (!conn.accessExpiresAt || conn.accessExpiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) {
    return { token: decrypt(conn.accessToken), conn };
  }
  let pending = refreshing.get(userId);
  if (!pending) {
    pending = refresh(conn).finally(() => refreshing.delete(userId));
    refreshing.set(userId, pending);
  }
  return { token: await pending, conn };
}

/**
 * La identidad con la que el agente firma los commits: el login de GitHub y
 * su correo noreply, para que GitHub los asocie a la cuenta.
 */
export function commitIdentity(conn: Pick<Connection, "githubId" | "login">) {
  return { name: conn.login, email: `${conn.githubId}+${conn.login}@users.noreply.github.com` };
}

export async function listInstallations(userId: string): Promise<Installation[]> {
  const { token } = await githubToken(userId);
  const data = await api<{
    installations: { id: number; repository_selection: "all" | "selected"; html_url: string; account: { login: string; type: "User" | "Organization"; avatar_url: string } }[];
  }>(token, "/user/installations?per_page=100");
  return data.installations.map((i) => ({
    id: i.id,
    account: i.account.login,
    type: i.account.type,
    avatarUrl: i.account.avatar_url,
    selection: i.repository_selection,
    settingsUrl: i.html_url,
  }));
}

/**
 * Los repos que el agente puede usar: los de todas las instalaciones que el
 * usuario ve, hasta 500, con si puede hacer push o no.
 */
export async function listRepos(userId: string): Promise<Repo[]> {
  const { token } = await githubToken(userId);
  const installations = await listInstallations(userId);
  const repos: Repo[] = [];
  for (const installation of installations) {
    for (let page = 1; repos.length < MAX_REPOS; page++) {
      const data = await api<{
        repositories: { full_name: string; private: boolean; default_branch: string; description: string | null; permissions?: { push?: boolean } }[];
      }>(token, `/user/installations/${installation.id}/repositories?per_page=100&page=${page}`);
      for (const r of data.repositories) {
        repos.push({ fullName: r.full_name, private: r.private, defaultBranch: r.default_branch, canPush: Boolean(r.permissions?.push), description: r.description });
      }
      if (data.repositories.length < 100) break;
    }
  }
  return repos.slice(0, MAX_REPOS);
}

/**
 * Borra la conexión y le pide a GitHub que revoque la autorización, así el
 * token deja de servir aunque alguien lo haya copiado.
 */
export async function disconnect(userId: string) {
  const conn = await githubConnection(userId);
  if (!conn) return;
  await db.delete(schema.githubConnection).where(eq(schema.githubConnection.userId, userId));
  const app = await githubApp();
  if (!app) return;
  const basic = Buffer.from(`${app.clientId}:${app.clientSecret}`).toString("base64");
  await fetch(`${API}/applications/${app.clientId}/grant`, {
    method: "DELETE",
    headers: { Accept: "application/vnd.github+json", Authorization: `Basic ${basic}`, "User-Agent": "nexo" },
    body: JSON.stringify({ access_token: decrypt(conn.accessToken) }),
    signal: AbortSignal.timeout(10_000),
  }).catch((err) => logError("github", err, { user: userId }));
}
