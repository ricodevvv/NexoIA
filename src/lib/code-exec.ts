import { spawn } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

export type RunInput = { code: string; files: { name: string; data: Buffer }[] };

export type RunOutput = {
  stdout: string;
  stderr: string;
  result: string | null;
  error: string | null;
  files: { name: string; mediaType: string; data: Buffer }[];
  durationMs: number;
};

const TIMEOUT_MS = 135_000;
const WARM_TIMEOUT_MS = 10 * 60_000;
const MAX_STDOUT = 40 * 1024 * 1024;
const WARM_PACKAGES = ["numpy", "pandas", "matplotlib", "scipy", "sympy", "scikit-learn"];

const root = process.cwd();
const cacheDir = path.join(os.tmpdir(), "nexo-pyodide-cache");
const runner = path.join(root, "sandbox", "python-runner.mjs");

/**
 * Comando externo que corre el sandbox (por ejemplo el contenedor de Docker
 * cuya única salida es el proxy de egress). Si no hay, se usa un proceso local
 * con el modelo de permisos de Node, que sirve para desarrollo pero no aísla la
 * red y no descarga paquetes.
 */
function sandboxCommand() {
  return process.env.CODE_SANDBOX_COMMAND?.trim().split(/\s+/).filter(Boolean) ?? [];
}

/**
 * La ejecución de código está prendida en desarrollo y apagada en producción
 * salvo que se active con CODE_EXECUTION=1.
 */
export function codeExecutionEnabled() {
  if (process.env.CODE_EXECUTION === "1") return true;
  if (process.env.CODE_EXECUTION === "0") return false;
  return process.env.NODE_ENV !== "production";
}

function readPaths() {
  const nodeModules = path.join(root, "node_modules");
  const paths = new Set([nodeModules, path.join(root, "sandbox"), cacheDir]);
  try {
    paths.add(path.dirname(realpathSync(path.join(nodeModules, "pyodide"))));
  } catch {}
  return [...paths];
}

function localArgs(writable: boolean) {
  mkdirSync(cacheDir, { recursive: true });
  return [
    process.execPath,
    "--permission",
    ...readPaths().map((p) => `--allow-fs-read=${p}`),
    ...(writable ? [`--allow-fs-write=${cacheDir}`] : []),
    "--max-old-space-size=512",
    runner,
  ];
}

function socketPath() {
  return process.env.CODE_SANDBOX_SOCKET?.trim() || null;
}

/**
 * Manda el trabajo al servicio del sandbox por un socket unix (modo
 * docker-compose, donde el sandbox corre en una red interna que solo sale por
 * el proxy de egress).
 */
function viaSocket(payload: object, socket: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      { socketPath: socket, path: "/run", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }, timeout: TIMEOUT_MS },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new Error("La ejecución se detuvo sin respuesta (probablemente pasó de 120 segundos)."));
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error(`La ejecución pasó de ${TIMEOUT_MS / 1000} segundos y se detuvo.`)));
    req.on("error", reject);
    req.end(body);
  });
}

function spawnRunner(payload: object, writable: boolean, timeoutMs = TIMEOUT_MS): Promise<Record<string, unknown>> {
  const socket = socketPath();
  if (socket) return viaSocket(payload, socket);
  const external = sandboxCommand();
  const [command, ...rest] = external.length ? external : localArgs(writable);

  return new Promise((resolve, reject) => {
    const child = spawn(command, rest, { env: {} as NodeJS.ProcessEnv, cwd: path.join(root, "sandbox"), stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`La ejecución pasó de ${timeoutMs / 1000} segundos y se detuvo.`));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_STDOUT) {
        child.kill("SIGKILL");
        return;
      }
      chunks.push(chunk);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error(size > MAX_STDOUT ? "La salida fue demasiado grande." : `El sandbox terminó sin respuesta (código ${code}).`));
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

let warming: Promise<void> | null = null;

/**
 * Descarga una vez los paquetes científicos más usados a una caché local. Es
 * la única ejecución con permiso de escritura y no corre código del usuario.
 */
export function warmCache() {
  if (sandboxCommand().length || socketPath()) return Promise.resolve();
  warming ??= spawnRunner({ warm: WARM_PACKAGES, cacheDir }, true, WARM_TIMEOUT_MS)
    .then(() => undefined)
    .catch((err) => {
      warming = null;
      console.error("[sandbox] no se pudo precargar la caché:", err.message);
    });
  return warming;
}

/**
 * Corre código Python en un proceso aparte: Pyodide (WebAssembly) dentro de
 * Node con el modelo de permisos activado, sin variables de entorno, sin
 * escritura a disco fuera de su caché de paquetes, sin procesos hijos y con
 * límite de tiempo.
 */
export async function runPython(input: RunInput): Promise<RunOutput> {
  await warmCache();
  const started = Date.now();
  const out = await spawnRunner(
    {
      code: input.code,
      cacheDir: sandboxCommand().length || socketPath() ? "/cache" : cacheDir,
      files: input.files.map((f) => ({ name: f.name, base64: f.data.toString("base64") })),
    },
    false,
  );
  if (typeof out.fatal === "string") throw new Error(out.fatal);
  const files = (out.files as { name: string; mediaType: string; base64: string }[]) ?? [];
  return {
    stdout: String(out.stdout ?? ""),
    stderr: String(out.stderr ?? ""),
    result: (out.result as string | null) ?? null,
    error: (out.error as string | null) ?? null,
    files: files.map((f) => ({ name: f.name, mediaType: f.mediaType, data: Buffer.from(f.base64, "base64") })),
    durationMs: Date.now() - started,
  };
}
