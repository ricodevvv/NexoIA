import { constants as fsConstants } from "node:fs";
import { constants as osConstants } from "node:os";

process.binding = (name) => {
  if (name === "constants") return { fs: fsConstants, os: osConstants };
  throw new Error(`process.binding("${name}") no está disponible en el sandbox`);
};

const { loadPyodide } = await import("pyodide");

const MAX_OUTPUT = 200_000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function capped(lines) {
  const text = lines.join("\n");
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n…(salida recortada)` : text;
}

const MEDIA = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  csv: "text/csv",
  json: "application/json",
  txt: "text/plain",
  md: "text/markdown",
  html: "text/html",
  xml: "application/xml",
  yml: "text/yaml",
  yaml: "text/yaml",
  py: "text/x-python",
  js: "text/javascript",
  ts: "text/plain",
  java: "text/x-java",
  pdf: "application/pdf",
  zip: "application/zip",
  tar: "application/x-tar",
  gz: "application/gzip",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const PRELUDE = `
import os
os.environ["MPLBACKEND"] = "AGG"
os.chdir("/mnt/data")
`;

const POSTLUDE = `
import sys as _sys
if "matplotlib.pyplot" in _sys.modules:
    import matplotlib.pyplot as _plt
    for _i, _n in enumerate(_plt.get_fignums()):
        _plt.figure(_n).savefig(f"/mnt/output/figura_{_i + 1}.png", dpi=110, bbox_inches="tight")
    _plt.close("all")
import os as _os, shutil as _shutil
for _name in _os.listdir("/mnt/output"):
    _path = _os.path.join("/mnt/output", _name)
    if _os.path.isdir(_path):
        _shutil.make_archive(_path, "zip", _path)
        _shutil.rmtree(_path)
`;

async function main() {
  const input = JSON.parse(await readStdin());
  const stdout = [];
  const stderr = [];
  const pyodide = await loadPyodide({
    packageCacheDir: input.cacheDir,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });

  if (input.warm) {
    await pyodide.loadPackage(input.warm, { messageCallback: () => {} });
    process.stdout.write(JSON.stringify({ ok: true }));
    return;
  }

  pyodide.FS.mkdirTree("/mnt/data");
  pyodide.FS.mkdirTree("/mnt/output");
  for (const file of input.files ?? []) {
    const safe = String(file.name).split(/[\\/]/).pop().replace(/^\.+/, "") || "archivo";
    pyodide.FS.writeFile(`/mnt/data/${safe}`, Buffer.from(file.base64, "base64"));
  }

  let result = null;
  let error = null;
  try {
    await pyodide.loadPackagesFromImports(input.code, { messageCallback: () => {} });
    const offline = () => Promise.reject(new Error("El sandbox no tiene acceso a internet"));
    globalThis.fetch = offline;
    globalThis.WebSocket = undefined;
    await pyodide.runPythonAsync(PRELUDE);
    const value = await pyodide.runPythonAsync(input.code);
    if (value !== undefined && value !== null) {
      result = String(value?.toString?.() ?? value);
      value?.destroy?.();
    }
  } catch (err) {
    const lines = String(err?.message ?? err).trim().split("\n");
    const start = lines.findIndex((line) => line.includes('File "<exec>"'));
    error = start === -1 ? lines.join("\n") : ["Traceback (most recent call last):", ...lines.slice(start)].join("\n");
  }
  try {
    await pyodide.runPythonAsync(POSTLUDE);
  } catch {}

  const files = [];
  let total = 0;
  for (const name of pyodide.FS.readdir("/mnt/output")) {
    if (name === "." || name === "..") continue;
    if (pyodide.FS.isDir(pyodide.FS.stat(`/mnt/output/${name}`).mode)) continue;
    const data = pyodide.FS.readFile(`/mnt/output/${name}`);
    total += data.length;
    if (files.length >= 10 || total > MAX_FILE_BYTES) break;
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    files.push({ name, mediaType: MEDIA[ext] ?? "application/octet-stream", base64: Buffer.from(data).toString("base64") });
  }

  process.stdout.write(JSON.stringify({ stdout: capped(stdout), stderr: capped(stderr), result, error, files }));
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ fatal: String(err?.message ?? err) }));
});
