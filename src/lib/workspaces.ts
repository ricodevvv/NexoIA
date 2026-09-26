import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { resolveKey } from "@/lib/ai/keys";
import { listModels, remoteModelId } from "@/lib/ai/models";
import type { ModelInfo } from "@/lib/ai/types";
import { userModels } from "@/lib/ai/user-models";
import { getPlan } from "@/lib/billing/usage";
import { decrypt, encrypt } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import { egressProxyUrl, NETWORK_LEVELS, type NetworkLevel, parseDomains } from "@/lib/egress";
import { HttpError } from "@/lib/http";
import { k8s, k8sEnabled, k8sNamespace } from "@/lib/k8s";
import { logError } from "@/lib/log";

export const CLOUD_PREFIX = "ce_";

const IMAGE = process.env.NEXO_WORKSPACE_IMAGE ?? "nexo-workspace:2";
const IDLE_MS = Number(process.env.NEXO_WORKSPACE_IDLE_MINUTES ?? 15) * 60_000;
const RETENTION_MS = Number(process.env.NEXO_SESSION_RETENTION_DAYS ?? 30) * 24 * 3600_000;
const MAX_RUNNING = Number(process.env.NEXO_SESSION_MAX_RUNNING ?? 3);
const newId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 12);
const LOCAL_PROXY_PORT = 3128;
const RESERVED_ENV = /^(NEXO|NEXOCODE|HTTPS?_PROXY|ALL_PROXY|NO_PROXY|NODE_USE_ENV_PROXY|JAVA_TOOL_OPTIONS|HOME|PATH)(_|$)/i;

type User = { id: string; email: string; name?: string | null };
type Pod = {
  metadata: { name: string; labels?: Record<string, string> };
  status?: {
    phase?: string;
    podIP?: string;
    conditions?: { type: string; status: string }[];
    containerStatuses?: { restartCount: number; state?: { waiting?: { reason?: string } } }[];
  };
};

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Autentica una petición que viene de dentro del contenedor de una sesión
 * con su token `nws_` y devuelve la fila de la sesión, con el id de su dueño.
 */
export async function workspaceFromRequest(request: Request) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return sessionFromToken(bearer);
}

export async function sessionFromToken(token: string) {
  if (!token.startsWith("nws_")) throw new HttpError(401, "Falta el token del espacio de trabajo");
  const row = await db.query.codeSession.findFirst({ where: eq(schema.codeSession.tokenHash, hashToken(token)) });
  if (!row) throw new HttpError(401, "Token inválido");
  return row;
}

/**
 * Dice si el usuario puede tener un espacio de trabajo en el clúster. Se
 * controla con `NEXO_WORKSPACES`: `pro` (por defecto), `all` u `off`. Los
 * emails de `NEXOCODE_ALLOWED_EMAILS` siempre pueden.
 */
export async function workspacesAllowed(user: User) {
  if (!k8sEnabled()) return false;
  const mode = process.env.NEXO_WORKSPACES ?? "pro";
  if (mode === "off") return false;
  const allowed = (process.env.NEXOCODE_ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase());
  if (allowed.includes(user.email.toLowerCase())) return true;
  if (mode === "all") return true;
  return (await getPlan(user.id)) === "pro";
}

/**
 * Los modelos que el agente del espacio puede usar: los del servidor que el
 * usuario tiene disponibles según su plan o sus keys, y sus endpoints propios.
 */
export async function workspaceModels(userId: string): Promise<ModelInfo[]> {
  const plan = await getPlan(userId);
  const out: ModelInfo[] = [];
  for (const model of listModels()) {
    const key = await resolveKey(userId, model.provider);
    if (!key) continue;
    if (model.tier === "pro" && plan !== "pro" && !key.byok) continue;
    out.push(model);
  }
  return [...out, ...(await userModels(userId))];
}

export function providerFor(model: ModelInfo) {
  if (model.endpointId) return { key: `nexo-ep-${model.endpointId}`, npm: "@ai-sdk/openai-compatible", path: `ep/${model.endpointId}`, name: model.group ?? "Endpoint" };
  if (model.provider === "anthropic") return { key: "nexo-anthropic", npm: "@ai-sdk/anthropic", path: "anthropic", name: "Anthropic" };
  if (model.provider === "openai") return { key: "nexo-openai", npm: "@ai-sdk/openai", path: "openai", name: "OpenAI" };
  return { key: "nexo-compat", npm: "@ai-sdk/openai-compatible", path: "compat", name: process.env.COMPAT_NAME ?? "Compatible" };
}

function publicUrl() {
  return (process.env.NEXO_PUBLIC_URL ?? process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "");
}

/**
 * Arma la config de nexocode del espacio: cada proveedor apunta al proxy de
 * modelos de Nexo con el token del espacio, así las API keys reales nunca
 * entran al pod. Las instrucciones del agente vienen en la imagen, sacadas de
 * `prompts/code/AGENTS.md`.
 */
export async function workspaceConfig(userId: string, token: string) {
  const base = publicUrl();
  const provider: Record<string, { npm: string; name: string; options: { baseURL: string; apiKey: string }; models: Record<string, { name: string }> }> = {};
  let first: string | null = null;
  for (const model of await workspaceModels(userId)) {
    const p = providerFor(model);
    provider[p.key] ??= { npm: p.npm, name: p.name, options: { baseURL: `${base}/api/llm/${p.path}/v1`, apiKey: token }, models: {} };
    provider[p.key].models[remoteModelId(model.id)] = { name: model.label };
    first ??= `${p.key}/${remoteModelId(model.id)}`;
  }
  return {
    provider,
    enabled_providers: Object.keys(provider),
    mcp: {
      nexo: {
        type: "local",
        command: ["node", "/usr/local/lib/nexo/present-files.mjs"],
        environment: { NEXO_URL: base, NEXO_TOKEN: token },
      },
    },
    instructions: ["/usr/local/lib/nexo/AGENTS.md"],
    ...(first ? { model: first } : {}),
    autoupdate: false,
    share: "disabled",
  };
}


export type Environment = typeof schema.codeEnvironment.$inferSelect;
export type SessionRow = typeof schema.codeSession.$inferSelect;

/**
 * Lee las variables de entorno en formato `.env`: `CLAVE=valor` por línea,
 * con comentarios `#` y comillas opcionales. Las que usa Nexo por dentro no
 * se pueden pisar.
 */
export function parseEnv(raw: string) {
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) throw new HttpError(400, `Esta línea no es una variable válida: ${trimmed.slice(0, 60)}`);
    const [, key, value] = match;
    if (RESERVED_ENV.test(key)) throw new HttpError(400, `${key} la usa Nexo y no se puede cambiar`);
    out[key] = value.replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

/**
 * Los entornos en la nube del usuario. Si todavía no tiene ninguno le crea
 * el predeterminado, con acceso de confianza a la red.
 */
export async function listEnvironments(userId: string): Promise<Environment[]> {
  const rows = await db.select().from(schema.codeEnvironment).where(eq(schema.codeEnvironment.userId, userId)).orderBy(asc(schema.codeEnvironment.createdAt));
  if (rows.length) return rows;
  const [created] = await db.insert(schema.codeEnvironment).values({ id: newId(), userId, name: "Predeterminado" }).returning();
  return [created];
}

export async function getEnvironment(userId: string, id: string) {
  const row = await db.query.codeEnvironment.findFirst({ where: and(eq(schema.codeEnvironment.id, id), eq(schema.codeEnvironment.userId, userId)) });
  if (!row) throw new HttpError(404, "No encontré ese entorno");
  return row;
}

/**
 * Lo que el navegador puede ver de un entorno. Las variables van enteras
 * porque solo las ve su dueño y las necesita para editarlas.
 */
export function publicEnvironment(env: Environment) {
  return {
    id: env.id,
    name: env.name,
    network: env.network as NetworkLevel,
    domains: env.domains,
    env: env.env ? decrypt(env.env) : "",
    setupScript: env.setupScript,
  };
}

/**
 * Da de alta una sesión en la nube con su propio token y contraseña. El pod
 * se crea aparte, con `ensureSessionPod`.
 */
export async function createSessionRow(user: User, env: Environment, { title, repo }: { title: string; repo: string | null }) {
  const token = `nws_${randomBytes(24).toString("base64url")}`;
  const [row] = await db
    .insert(schema.codeSession)
    .values({
      id: newId(),
      userId: user.id,
      environmentId: env.id,
      title,
      repo,
      token: encrypt(token),
      tokenHash: hashToken(token),
      password: encrypt(randomBytes(24).toString("base64url")),
    })
    .returning();
  return row;
}

export async function getSessionRow(userId: string, id: string) {
  const row = await db.query.codeSession.findFirst({ where: and(eq(schema.codeSession.id, id), eq(schema.codeSession.userId, userId)) });
  if (!row) throw new HttpError(404, "No encontré esa sesión");
  return row;
}

export async function listSessionRows(userId: string, environmentId: string) {
  return db
    .select()
    .from(schema.codeSession)
    .where(and(eq(schema.codeSession.userId, userId), eq(schema.codeSession.environmentId, environmentId)))
    .orderBy(asc(schema.codeSession.lastActiveAt));
}

const ns = () => `/api/v1/namespaces/${k8sNamespace()}`;
const podName = (id: string) => `cs-${id}`;
const userLabel = (userId: string) => hashToken(userId).slice(0, 16);

function podSpec(row: SessionRow, user: User) {
  const name = podName(row.id);
  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: { name, labels: { app: "nexo-workspace", session: row.id, user: userLabel(user.id) } },
    spec: {
      automountServiceAccountToken: false,
      enableServiceLinks: false,
      restartPolicy: "Always",
      securityContext: { runAsUser: 1000, runAsGroup: 1000, runAsNonRoot: true, fsGroup: 1000, seccompProfile: { type: "RuntimeDefault" } },
      containers: [
        {
          name: "agent",
          image: IMAGE,
          imagePullPolicy: "Never",
          ports: [{ containerPort: 4096 }],
          envFrom: [{ secretRef: { name: `${name}-env` } }, { secretRef: { name } }],
          env: [
            { name: "NEXO_USER_NAME", value: user.name || "Nexo" },
            { name: "NEXO_USER_EMAIL", value: user.email },
          ],
          resources: {
            requests: { memory: "1Gi", cpu: "250m", "ephemeral-storage": "512Mi" },
            limits: { memory: "2Gi", cpu: "1", "ephemeral-storage": "4Gi" },
          },
          readinessProbe: { tcpSocket: { port: 4096 }, periodSeconds: 2, failureThreshold: 60 },
          securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"] } },
          volumeMounts: [{ name: "home", mountPath: "/home/nexo" }],
        },
      ],
      volumes: [{ name: "home", persistentVolumeClaim: { claimName: name } }],
    },
  };
}

function ready(pod: Pod) {
  return pod.status?.phase === "Running" && Boolean(pod.status.podIP) && pod.status.conditions?.some((c) => c.type === "Ready" && c.status === "True");
}

/**
 * Variables para que todo en el pod salga por el proxy. Muchos programas no
 * saben mandarle credenciales (Java, los plugins de Gradle, algunos CLIs),
 * así que apuntan sin usuario al proxy local del pod, que añade la política
 * firmada y reenvía al proxy de salida. Java ignora `HTTP_PROXY`, por eso
 * también lo recibe en `JAVA_TOOL_OPTIONS`.
 */
function proxyEnv(env: Environment): Record<string, string> {
  const proxy = egressProxyUrl(env.network as NetworkLevel, parseDomains(env.domains));
  if (!proxy) return {};
  const local = `http://127.0.0.1:${LOCAL_PROXY_PORT}`;
  const noProxy = "localhost,127.0.0.1,::1";
  const java = ["http", "https"]
    .flatMap((p) => [`-D${p}.proxyHost=127.0.0.1`, `-D${p}.proxyPort=${LOCAL_PROXY_PORT}`])
    .concat("-Dhttp.nonProxyHosts=localhost|127.0.0.1");
  return {
    NEXO_UPSTREAM_PROXY: proxy,
    HTTPS_PROXY: local,
    HTTP_PROXY: local,
    https_proxy: local,
    http_proxy: local,
    ALL_PROXY: local,
    all_proxy: local,
    NO_PROXY: noProxy,
    no_proxy: noProxy,
    NODE_USE_ENV_PROXY: "1",
    JAVA_TOOL_OPTIONS: java.join(" "),
  };
}

async function replaceSecret(name: string, labels: Record<string, string>, stringData: Record<string, string>) {
  await k8s("DELETE", `${ns()}/secrets/${name}`);
  const res = await k8s("POST", `${ns()}/secrets`, { apiVersion: "v1", kind: "Secret", metadata: { name, labels }, stringData });
  if (res.status >= 300 && res.status !== 409) throw new Error(`No se pudo crear el secreto (${res.status})`);
}

/**
 * Crea el disco, los secretos y el pod de la sesión. Los secretos se arman de
 * nuevo cada vez, así un cambio en el entorno (red, variables, script) se
 * aplica la próxima vez que el contenedor arranca.
 */
async function createResources(row: SessionRow, user: User) {
  const name = podName(row.id);
  const labels = { app: "nexo-workspace", session: row.id };
  const env = await getEnvironment(user.id, row.environmentId);
  const token = decrypt(row.token);
  const pvc = await k8s("POST", `${ns()}/persistentvolumeclaims`, {
    apiVersion: "v1",
    kind: "PersistentVolumeClaim",
    metadata: { name, labels },
    spec: { accessModes: ["ReadWriteOnce"], storageClassName: "local-path", resources: { requests: { storage: process.env.NEXO_WORKSPACE_DISK ?? "5Gi" } } },
  });
  if (pvc.status >= 300 && pvc.status !== 409) throw new Error(`No se pudo crear el disco (${pvc.status})`);
  await replaceSecret(`${name}-env`, labels, env.env ? parseEnv(decrypt(env.env)) : {});
  await replaceSecret(name, labels, {
    NEXOCODE_SERVER_PASSWORD: decrypt(row.password),
    NEXO_CONFIG: JSON.stringify(await workspaceConfig(user.id, token)),
    NEXO_URL: publicUrl(),
    NEXO_TOKEN: token,
    NEXO_SETUP_SCRIPT: env.setupScript,
    ...proxyEnv(env),
  });
  const pod = await k8s("POST", `${ns()}/pods`, podSpec(row, user));
  if (pod.status >= 300 && pod.status !== 409) throw new Error(`No se pudo crear el pod (${pod.status}): ${JSON.stringify(pod.body).slice(0, 300)}`);
}

/**
 * Antes de prender otro contenedor, apaga los más viejos del usuario si ya
 * tiene el máximo corriendo. Sus discos se quedan.
 */
async function makeRoom(user: User, keep: string) {
  const res = await k8s<{ items: Pod[] }>("GET", `${ns()}/pods?labelSelector=${encodeURIComponent(`app=nexo-workspace,user=${userLabel(user.id)}`)}`);
  if (res.status !== 200) return;
  const ids = res.body.items.map((p) => p.metadata.labels?.session).filter((id): id is string => Boolean(id) && id !== keep);
  if (ids.length < MAX_RUNNING) return;
  const rows = await db.select().from(schema.codeSession).where(inArray(schema.codeSession.id, ids)).orderBy(asc(schema.codeSession.lastActiveAt));
  const known = new Set(rows.map((r) => r.id));
  const order = [...ids.filter((id) => !known.has(id)), ...rows.map((r) => r.id)];
  for (const id of order.slice(0, ids.length - MAX_RUNNING + 1)) {
    cache.delete(id);
    await k8s("DELETE", `${ns()}/pods/${podName(id)}`);
  }
}

const cache = new Map<string, { ip: string; until: number }>();
const starting = new Map<string, Promise<string>>();

/**
 * Deja prendido el contenedor de la sesión y devuelve cómo hablarle a su
 * nexocode. Si estaba apagado lo vuelve a crear con el mismo disco, así los
 * archivos, el repo clonado y la conversación siguen ahí.
 */
export async function ensureSessionPod(user: User, row: SessionRow, envName: string) {
  if (!(await workspacesAllowed(user))) throw new HttpError(403, "Tu plan no incluye entornos en la nube");
  await touchSession(row.id);
  const server = (ip: string) => ({
    id: `${CLOUD_PREFIX}${row.environmentId}`,
    name: envName,
    url: `http://${ip}:4096`,
    username: "nexocode",
    password: decrypt(row.password),
    directory: null,
    managed: true,
  });

  const hit = cache.get(row.id);
  if (hit && hit.until > Date.now()) return server(hit.ip);

  let pending = starting.get(row.id);
  if (!pending) {
    pending = startPod(row, user).finally(() => starting.delete(row.id));
    starting.set(row.id, pending);
  }
  return server(await pending);
}

async function startPod(row: SessionRow, user: User) {
  const name = podName(row.id);
  const deadline = Date.now() + 180_000;
  let created = false;
  while (Date.now() < deadline) {
    const res = await k8s<Pod>("GET", `${ns()}/pods/${name}`);
    if (res.status === 200 && ready(res.body)) {
      cache.set(row.id, { ip: res.body.status!.podIP!, until: Date.now() + 20_000 });
      return res.body.status!.podIP!;
    }
    const crashing = res.status === 200 && res.body.status?.containerStatuses?.some((c) => c.restartCount >= 2 || c.state?.waiting?.reason === "CrashLoopBackOff");
    if (crashing) {
      await k8s("DELETE", `${ns()}/pods/${name}?gracePeriodSeconds=0`);
      throw new HttpError(502, "El contenedor de la sesión no pudo arrancar. Ya lo reiniciamos; intenta de nuevo en un momento.");
    }
    if (res.status === 200 && ["Failed", "Succeeded"].includes(res.body.status?.phase ?? "")) {
      await k8s("DELETE", `${ns()}/pods/${name}?gracePeriodSeconds=0`);
    } else if (res.status === 404 && !created) {
      created = true;
      await makeRoom(user, row.id);
      await createResources(row, user);
    } else if (res.status >= 400 && res.status !== 404) {
      throw new HttpError(502, `El clúster respondió ${res.status}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new HttpError(504, "El contenedor tardó demasiado en arrancar. Intenta de nuevo en un momento.");
}

/**
 * Marca actividad en la sesión para que el apagado automático no la corte.
 */
export async function touchSession(id: string) {
  await db.update(schema.codeSession).set({ lastActiveAt: new Date() }).where(eq(schema.codeSession.id, id));
}

/**
 * Borra todo lo de la sesión en el clúster: pod, disco y secretos.
 */
export async function deleteSessionResources(id: string) {
  const name = podName(id);
  cache.delete(id);
  await k8s("DELETE", `${ns()}/pods/${name}?gracePeriodSeconds=0`);
  await k8s("DELETE", `${ns()}/persistentvolumeclaims/${name}`);
  await k8s("DELETE", `${ns()}/secrets/${name}`);
  await k8s("DELETE", `${ns()}/secrets/${name}-env`);
}

/**
 * Borra la sesión completa: lo del clúster y su fila.
 */
export async function deleteSession(id: string) {
  if (k8sEnabled()) await deleteSessionResources(id);
  await db.delete(schema.codeSession).where(eq(schema.codeSession.id, id));
}

/**
 * Apaga los contenedores que llevan un rato sin uso (si el agente está
 * trabajando los deja seguir) y borra del todo las sesiones que nadie abre
 * desde hace `NEXO_SESSION_RETENTION_DAYS` días.
 */
export async function reapIdleWorkspaces() {
  if (!k8sEnabled()) return;
  const res = await k8s<{ items: Pod[] }>("GET", `${ns()}/pods?labelSelector=app%3Dnexo-workspace`);
  if (res.status === 200) {
    const ids = res.body.items.map((p) => p.metadata.labels?.session).filter((id): id is string => Boolean(id));
    const rows = ids.length ? await db.select().from(schema.codeSession).where(inArray(schema.codeSession.id, ids)) : [];
    for (const pod of res.body.items) {
      const row = rows.find((r) => r.id === pod.metadata.labels?.session);
      if (row && Date.now() - row.lastActiveAt.getTime() < IDLE_MS) continue;
      if (row && pod.status?.podIP && (await agentBusy(pod.status.podIP, decrypt(row.password)))) continue;
      if (row) cache.delete(row.id);
      await k8s("DELETE", `${ns()}/pods/${pod.metadata.name}`);
    }
  }
  const stale = await db.select({ id: schema.codeSession.id }).from(schema.codeSession).where(lt(schema.codeSession.lastActiveAt, new Date(Date.now() - RETENTION_MS)));
  for (const { id } of stale) await deleteSession(id);
}

async function agentBusy(ip: string, password: string) {
  try {
    const res = await fetch(`http://${ip}:4096/session/status`, {
      headers: { Authorization: `Basic ${Buffer.from(`nexocode:${password}`).toString("base64")}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const status = (await res.json()) as Record<string, { type: string }>;
    return Object.values(status).some((s) => s.type !== "idle");
  } catch {
    return false;
  }
}

/**
 * Arranca la revisión periódica de contenedores inactivos (cada 5 minutos).
 */
export function startWorkspaceReaper() {
  if (!k8sEnabled()) return;
  setInterval(() => reapIdleWorkspaces().catch((err) => logError("workspaces", err)), 5 * 60_000).unref();
}

/**
 * Un contenedor ya prendido del usuario, si hay, para preguntarle cosas que
 * no dependen de la sesión (como la lista de modelos) sin prender otro.
 */
export async function runningSessionServer(userId: string) {
  const rows = await db.select().from(schema.codeSession).where(eq(schema.codeSession.userId, userId));
  const row = rows.filter((r) => (cache.get(r.id)?.until ?? 0) > Date.now()).sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime())[0];
  if (!row) return null;
  return { id: row.id, name: "", url: `http://${cache.get(row.id)!.ip}:4096`, username: "nexocode", password: decrypt(row.password), directory: null, managed: true };
}

export const EnvironmentInput = z.object({
  name: z.string().trim().min(1).max(60),
  network: z.enum(NETWORK_LEVELS),
  domains: z.string().max(4000).default(""),
  env: z.string().max(20_000).default(""),
  setupScript: z.string().max(20_000).default(""),
});

/**
 * Deja listos los campos de un entorno para guardarlos: valida las variables
 * (tira un error si alguna está mal) y las cifra.
 */
export function environmentValues(input: z.infer<typeof EnvironmentInput>) {
  parseEnv(input.env);
  return {
    name: input.name,
    network: input.network,
    domains: parseDomains(input.domains).join("\n"),
    env: input.env.trim() ? encrypt(input.env) : null,
    setupScript: input.setupScript.replace(/\r\n/g, "\n"),
    updatedAt: new Date(),
  };
}

/**
 * Crea un entorno en la nube para el usuario (máximo 10).
 */
export async function createEnvironment(userId: string, input: z.infer<typeof EnvironmentInput>) {
  const existing = await db.select({ id: schema.codeEnvironment.id }).from(schema.codeEnvironment).where(eq(schema.codeEnvironment.userId, userId));
  if (existing.length >= 10) throw new HttpError(400, "Llegaste al máximo de 10 entornos");
  const [row] = await db.insert(schema.codeEnvironment).values({ id: newId(), userId, ...environmentValues(input) }).returning();
  return row;
}

/**
 * Borra un entorno con todas sus sesiones, incluidos sus contenedores y discos.
 */
export async function deleteEnvironment(userId: string, id: string) {
  const env = await getEnvironment(userId, id);
  for (const row of await listSessionRows(userId, env.id)) await deleteSession(row.id);
  await db.delete(schema.codeEnvironment).where(eq(schema.codeEnvironment.id, env.id));
}
