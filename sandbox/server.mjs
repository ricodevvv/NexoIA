import { spawn } from "node:child_process";
import { chmodSync, existsSync, rmSync } from "node:fs";
import http from "node:http";

const SOCKET = process.env.SANDBOX_SOCKET ?? "/run/nexo-sandbox/sandbox.sock";
const MAX_CONCURRENT = Number(process.env.SANDBOX_CONCURRENCY ?? 2);
const MAX_BODY = 60 * 1024 * 1024;
let running = 0;

function runOnce(payload) {
  return new Promise((resolve) => {
    const child = spawn(
      "/usr/bin/timeout",
      ["-s", "KILL", "60", process.execPath, "--permission", "--allow-fs-read=/sandbox", "--allow-fs-read=/cache", "--max-old-space-size=512", "python-runner.mjs"],
      { cwd: "/sandbox", env: {}, stdio: ["pipe", "pipe", "ignore"] },
    );
    const chunks = [];
    child.stdout.on("data", (c) => chunks.push(c));
    child.on("error", (err) => resolve(Buffer.from(JSON.stringify({ fatal: `No se pudo iniciar el sandbox: ${err.message}` }))));
    child.on("close", () => resolve(Buffer.concat(chunks)));
    child.stdin.end(payload);
  });
}

/**
 * Servicio del sandbox para docker-compose: corre sin red y recibe trabajos
 * por un socket unix compartido con la app. Cada ejecución es un proceso nuevo
 * con el modelo de permisos de Node y un límite de 60 segundos.
 */
const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200).end("ok");
    return;
  }
  if (req.method !== "POST" || req.url !== "/run") {
    res.writeHead(404).end();
    return;
  }
  if (running >= MAX_CONCURRENT) {
    res.writeHead(429).end(JSON.stringify({ fatal: "El sandbox está ocupado, intenta en unos segundos." }));
    return;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      res.writeHead(413).end();
      return;
    }
    chunks.push(chunk);
  }
  running++;
  try {
    const out = await runOnce(Buffer.concat(chunks));
    res.writeHead(200, { "Content-Type": "application/json" }).end(out);
  } finally {
    running--;
  }
});

if (existsSync(SOCKET)) rmSync(SOCKET);
server.listen(SOCKET, () => {
  chmodSync(SOCKET, 0o666);
  console.log(`sandbox escuchando en ${SOCKET}`);
});
