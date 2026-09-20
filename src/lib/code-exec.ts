import { spawn } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";
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

const TIMEOUT_MS = 60_000;
const MAX_STDOUT = 40 * 1024 * 1024;
const WARM_PACKAGES = ["numpy", "pandas", "matplotlib", "scipy", "sympy", "scikit-learn"];

const root = process.cwd();
const cacheDir = path.join(os.tmpdir(), "nexo-pyodide-cache");
const runner = path.join(root, "sandbox", "python-runner.mjs");

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

function spawnRunner(payload: object, writable: boolean): Promise<Record<string, unknown>> {
  mkdirSync(cacheDir, { recursive: true });
  const args = [
    "--permission",
    ...readPaths().map((p) => `--allow-fs-read=${p}`),
    ...(writable ? [`--allow-fs-write=${cacheDir}`] : []),
    "--max-old-space-size=512",
    runner,
  ];
  const wrapper = process.env.CODE_SANDBOX_WRAPPER?.trim().split(/\s+/).filter(Boolean) ?? [];
  const [command, ...rest] = wrapper.length ? [...wrapper, process.execPath, ...args] : [process.execPath, ...args];

  return new Promise((resolve, reject) => {
    const child = spawn(command, rest, { env: {} as NodeJS.ProcessEnv, cwd: path.join(root, "sandbox"), stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`La ejecución pasó de ${TIMEOUT_MS / 1000} segundos y se detuvo.`));
    }, TIMEOUT_MS);
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
  warming ??= spawnRunner({ warm: WARM_PACKAGES, cacheDir }, true)
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
 * escritura a disco, sin procesos hijos y con límite de tiempo.
 */
export async function runPython(input: RunInput): Promise<RunOutput> {
  await warmCache();
  const started = Date.now();
  const out = await spawnRunner(
    {
      code: input.code,
      cacheDir,
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
