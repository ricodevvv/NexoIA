import { createHash, randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { resolveKey } from "@/lib/ai/keys";
import { listModels, remoteModelId } from "@/lib/ai/models";
import type { ModelInfo } from "@/lib/ai/types";
import { userModels } from "@/lib/ai/user-models";
import { getPlan } from "@/lib/billing/usage";
import { decrypt, encrypt } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { k8s, k8sEnabled, k8sNamespace } from "@/lib/k8s";
import { logError } from "@/lib/log";

export const WORKSPACE_SERVER_ID = "workspace";

const IMAGE = process.env.NEXO_WORKSPACE_IMAGE ?? "nexo-workspace:2";
const IDLE_MS = Number(process.env.NEXO_WORKSPACE_IDLE_MINUTES ?? 15) * 60_000;
const newId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 12);

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
 * Autentica una petición que viene de dentro de un espacio de trabajo con su
 * token `nws_` y devuelve la fila del espacio, con el id de su dueño.
 */
export async function workspaceFromRequest(request: Request) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!bearer.startsWith("nws_")) throw new HttpError(401, "Falta el token del espacio de trabajo");
  const row = await db.query.codeWorkspace.findFirst({ where: eq(schema.codeWorkspace.tokenHash, hashToken(bearer)) });
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

async function workspaceRow(user: User) {
  const found = await db.query.codeWorkspace.findFirst({ where: eq(schema.codeWorkspace.userId, user.id) });
  if (found) return found;
  const token = `nws_${randomBytes(24).toString("base64url")}`;
  const [created] = await db
    .insert(schema.codeWorkspace)
    .values({
      id: newId(),
      userId: user.id,
      token: encrypt(token),
      tokenHash: hashToken(token),
      password: encrypt(randomBytes(24).toString("base64url")),
    })
    .onConflictDoNothing()
    .returning();
  return created ?? (await db.query.codeWorkspace.findFirst({ where: eq(schema.codeWorkspace.userId, user.id) }))!;
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

function providerFor(model: ModelInfo) {
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

const ns = () => `/api/v1/namespaces/${k8sNamespace()}`;
const podName = (id: string) => `ws-${id}`;

function podSpec(id: string, user: User) {
  const name = podName(id);
  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: { name, labels: { app: "nexo-workspace", workspace: id } },
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
          envFrom: [{ secretRef: { name } }],
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

async function createResources(id: string, user: User, token: string, password: string) {
  const name = podName(id);
  const pvc = await k8s("POST", `${ns()}/persistentvolumeclaims`, {
    apiVersion: "v1",
    kind: "PersistentVolumeClaim",
    metadata: { name, labels: { app: "nexo-workspace", workspace: id } },
    spec: { accessModes: ["ReadWriteOnce"], storageClassName: "local-path", resources: { requests: { storage: process.env.NEXO_WORKSPACE_DISK ?? "5Gi" } } },
  });
  if (pvc.status >= 300 && pvc.status !== 409) throw new Error(`No se pudo crear el disco (${pvc.status})`);
  await k8s("DELETE", `${ns()}/secrets/${name}`);
  const secret = await k8s("POST", `${ns()}/secrets`, {
    apiVersion: "v1",
    kind: "Secret",
    metadata: { name, labels: { app: "nexo-workspace", workspace: id } },
    stringData: {
      NEXOCODE_SERVER_PASSWORD: password,
      NEXO_CONFIG: JSON.stringify(await workspaceConfig(user.id, token)),
      NEXO_URL: publicUrl(),
      NEXO_TOKEN: token,
    },
  });
  if (secret.status >= 300 && secret.status !== 409) throw new Error(`No se pudo crear el secreto (${secret.status})`);
  const pod = await k8s("POST", `${ns()}/pods`, podSpec(id, user));
  if (pod.status >= 300 && pod.status !== 409) throw new Error(`No se pudo crear el pod (${pod.status}): ${JSON.stringify(pod.body).slice(0, 300)}`);
}

const cache = new Map<string, { ip: string; until: number }>();
const starting = new Map<string, Promise<string>>();

/**
 * Deja prendido el espacio de trabajo del usuario y devuelve cómo hablarle:
 * crea el disco, el secreto y el pod si hace falta y espera a que nexocode
 * responda. Los archivos viven en el disco y sobreviven a los apagados.
 */
export async function ensureWorkspace(user: User) {
  if (!(await workspacesAllowed(user))) throw new HttpError(403, "Tu plan no incluye espacios de trabajo en la nube");
  const row = await workspaceRow(user);
  await db.update(schema.codeWorkspace).set({ lastActiveAt: new Date() }).where(eq(schema.codeWorkspace.id, row.id));
  const password = decrypt(row.password);
  const server = (ip: string) => ({
    id: WORKSPACE_SERVER_ID,
    name: "Mi espacio en la nube",
    url: `http://${ip}:4096`,
    username: "nexocode",
    password,
    directory: null,
    managed: true,
  });

  const hit = cache.get(row.id);
  if (hit && hit.until > Date.now()) return server(hit.ip);

  let pending = starting.get(row.id);
  if (!pending) {
    pending = startPod(row.id, user, decrypt(row.token), password).finally(() => starting.delete(row.id));
    starting.set(row.id, pending);
  }
  return server(await pending);
}

async function startPod(id: string, user: User, token: string, password: string) {
  const name = podName(id);
  const deadline = Date.now() + 120_000;
  let created = false;
  while (Date.now() < deadline) {
    const res = await k8s<Pod>("GET", `${ns()}/pods/${name}`);
    if (res.status === 200 && ready(res.body)) {
      cache.set(id, { ip: res.body.status!.podIP!, until: Date.now() + 20_000 });
      return res.body.status!.podIP!;
    }
    const crashing = res.status === 200 && res.body.status?.containerStatuses?.some((c) => c.restartCount >= 2 || c.state?.waiting?.reason === "CrashLoopBackOff");
    if (crashing) {
      await k8s("DELETE", `${ns()}/pods/${name}?gracePeriodSeconds=0`);
      throw new HttpError(502, "Tu espacio no pudo arrancar. Ya lo reiniciamos; intenta de nuevo en un momento.");
    }
    if (res.status === 200 && ["Failed", "Succeeded"].includes(res.body.status?.phase ?? "")) {
      await k8s("DELETE", `${ns()}/pods/${name}?gracePeriodSeconds=0`);
    } else if (res.status === 404 && !created) {
      created = true;
      await createResources(id, user, token, password);
    } else if (res.status >= 400 && res.status !== 404) {
      throw new HttpError(502, `El clúster respondió ${res.status}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new HttpError(504, "Tu espacio tardó demasiado en arrancar. Intenta de nuevo en un momento.");
}

/**
 * Marca actividad en el espacio para que el apagado automático no lo corte.
 */
export async function touchWorkspace(userId: string) {
  await db.update(schema.codeWorkspace).set({ lastActiveAt: new Date() }).where(eq(schema.codeWorkspace.userId, userId));
}

/**
 * Apaga el pod del usuario. El disco se queda, así al volver sigue todo.
 */
export async function stopWorkspace(userId: string) {
  const row = await db.query.codeWorkspace.findFirst({ where: eq(schema.codeWorkspace.userId, userId) });
  if (!row) return;
  cache.delete(row.id);
  await k8s("DELETE", `${ns()}/pods/${podName(row.id)}`);
}

/**
 * Apaga los espacios que llevan un rato sin uso. Si el agente está trabajando
 * en ese momento, lo deja seguir.
 */
export async function reapIdleWorkspaces() {
  if (!k8sEnabled()) return;
  const res = await k8s<{ items: Pod[] }>("GET", `${ns()}/pods?labelSelector=app%3Dnexo-workspace`);
  if (res.status !== 200) return;
  const ids = res.body.items.map((p) => p.metadata.labels?.workspace).filter((id): id is string => Boolean(id));
  if (!ids.length) return;
  const rows = await db.select().from(schema.codeWorkspace).where(inArray(schema.codeWorkspace.id, ids));
  for (const pod of res.body.items) {
    const row = rows.find((r) => r.id === pod.metadata.labels?.workspace);
    if (row && Date.now() - row.lastActiveAt.getTime() < IDLE_MS) continue;
    if (row && pod.status?.podIP && (await agentBusy(pod.status.podIP, decrypt(row.password)))) continue;
    cache.delete(row?.id ?? "");
    await k8s("DELETE", `${ns()}/pods/${pod.metadata.name}`);
  }
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
 * Arranca la revisión periódica de espacios inactivos (cada 5 minutos).
 */
export function startWorkspaceReaper() {
  if (!k8sEnabled()) return;
  setInterval(() => reapIdleWorkspaces().catch((err) => logError("workspaces", err)), 5 * 60_000).unref();
}
