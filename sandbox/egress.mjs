import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import http from "node:http";
import net from "node:net";

const PORT = Number(process.env.EGRESS_PORT ?? 3128);
const ALLOWED_PORTS = new Set((process.env.EGRESS_PORTS ?? "80,443").split(",").map(Number));
const IDLE_MS = Number(process.env.EGRESS_IDLE_SECONDS ?? 30) * 1000;
const SECRET = process.env.EGRESS_SECRET ?? "";
const CONNECT_TIMEOUT_MS = 15_000;

const TRUSTED = [
  "github.com", "*.github.com", "*.githubusercontent.com", "ghcr.io", "gitlab.com", "*.gitlab.com", "bitbucket.org",
  "registry.npmjs.org", "*.npmjs.org", "*.npmjs.com", "registry.yarnpkg.com", "*.yarnpkg.com", "nodejs.org", "*.nodejs.org",
  "jsr.io", "*.jsr.io", "deno.land", "*.deno.land", "bun.sh", "*.bun.sh",
  "pypi.org", "*.pypi.org", "files.pythonhosted.org", "*.pythonhosted.org", "astral.sh", "*.astral.sh",
  "conda.anaconda.org", "repo.anaconda.com",
  "repo.maven.apache.org", "repo1.maven.org", "*.maven.org", "*.gradle.org", "jitpack.io",
  "crates.io", "*.crates.io", "*.rust-lang.org", "sh.rustup.rs",
  "proxy.golang.org", "sum.golang.org", "*.golang.org", "go.dev", "*.go.dev",
  "rubygems.org", "*.rubygems.org", "packagist.org", "*.packagist.org", "nuget.org", "*.nuget.org",
  "deb.debian.org", "security.debian.org", "models.dev",
];
const MAX_BYTES = Number(process.env.EGRESS_MAX_MB ?? 512) * 1024 * 1024;

const BLOCKED_V4 = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function v4ToInt(ip) {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

/**
 * Dice si una IP es pública. Todo lo privado, local, de enlace o reservado
 * queda fuera, así el sandbox no alcanza el host, el clúster ni el servicio de
 * metadatos de la nube.
 */
function isPublic(ip) {
  if (net.isIPv4(ip)) {
    const n = v4ToInt(ip);
    return !BLOCKED_V4.some(([base, bits]) => (n & (~0 << (32 - bits))) >>> 0 === v4ToInt(base));
  }
  if (!net.isIPv6(ip)) return false;
  const lower = ip.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublic(mapped[1]);
  if (lower === "::" || lower === "::1") return false;
  return !/^(fc|fd|fe[89ab]|ff|64:ff9b:|2001:db8:|2001:0?:|2001::|2002:)/.test(lower);
}

async function resolvePublic(host) {
  const name = host.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(name) ? [{ address: name }] : await lookup(name, { all: true });
  if (!addresses.length || !addresses.every((a) => isPublic(a.address))) throw new Error(`destino no permitido: ${name}`);
  return addresses[0].address;
}

/**
 * Lee la política de red que manda el pod en Proxy-Authorization: un JSON en
 * base64url firmado por Nexo con `EGRESS_SECRET`, así el pod no puede
 * cambiársela. `n` es el nivel (`none`, `trusted` o `full`) y `d` los
 * dominios extra. Sin secreto configurado todo sale como `full`.
 */
function readPolicy(req) {
  if (!SECRET) return { n: "full", d: [] };
  const header = String(req.headers["proxy-authorization"] ?? "");
  if (!header.toLowerCase().startsWith("basic ")) return null;
  const token = Buffer.from(header.slice(6), "base64").toString("utf8").split(":").slice(1).join(":");
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", SECRET).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const policy = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return ["none", "trusted", "full"].includes(policy.n) && Array.isArray(policy.d) ? policy : null;
  } catch {
    return null;
  }
}

function matches(pattern, host) {
  if (pattern.startsWith("*.")) return host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1;
  return host === pattern;
}

function permitted(policy, host) {
  if (policy.n === "full") return true;
  const name = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  return [...(policy.n === "trusted" ? TRUSTED : []), ...policy.d].some((p) => matches(String(p).toLowerCase(), name));
}

function capped(socket) {
  let bytes = 0;
  socket.setTimeout(IDLE_MS, () => socket.destroy());
  socket.on("data", (chunk) => {
    bytes += chunk.length;
    if (bytes > MAX_BYTES) socket.destroy();
  });
  return socket;
}

function log(kind, target, detail = "") {
  console.log(`${new Date().toISOString()} ${kind} ${target} ${detail}`.trim());
}

/**
 * Proxy de salida del sandbox. El contenedor que corre el código vive en una
 * red interna sin ruta al exterior y esta es su única puerta: acepta CONNECT y
 * peticiones HTTP planas a los puertos permitidos, resuelve el nombre, rechaza
 * cualquier IP que no sea pública y se conecta a la misma IP que revisó, así un
 * DNS que cambia de respuesta no sirve para colarse a la red interna. Con
 * `EGRESS_SECRET` también sirve a los pods de Nexo Code: cada uno trae su
 * política firmada y solo sale a los dominios que su entorno permite.
 */
const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url);
  } catch {
    res.writeHead(400).end("solo peticiones de proxy");
    return;
  }
  const policy = readPolicy(req);
  if (!policy) {
    res.writeHead(407, { "Proxy-Authenticate": 'Basic realm="nexo"' }).end("falta la política de red");
    return;
  }
  if (!permitted(policy, url.hostname)) {
    log("DENY", url.host, "fuera de la política");
    res.writeHead(403).end(`nexo: ${url.hostname} no está permitido por el acceso a la red de este entorno`);
    return;
  }
  const port = Number(url.port || 80);
  if (url.protocol !== "http:" || !ALLOWED_PORTS.has(port)) {
    res.writeHead(403).end("puerto no permitido");
    return;
  }
  try {
    const ip = await resolvePublic(url.hostname);
    const headers = { ...req.headers, host: url.host };
    delete headers["proxy-connection"];
    delete headers["proxy-authorization"];
    const upstream = http.request({ host: ip, port, method: req.method, path: `${url.pathname}${url.search}`, headers, timeout: IDLE_MS }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    upstream.on("timeout", () => upstream.destroy());
    upstream.on("error", () => res.headersSent ? res.destroy() : res.writeHead(502).end());
    req.pipe(upstream);
    log("HTTP", url.host);
  } catch (err) {
    log("DENY", url.host, err.message);
    res.writeHead(403).end(err.message);
  }
});

server.on("connect", async (req, client, head) => {
  client.on("error", () => client.destroy());
  const [host, rawPort] = String(req.url).split(/:(?=\d+$)/);
  const port = Number(rawPort);
  if (!host || !ALLOWED_PORTS.has(port)) {
    client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    return;
  }
  const policy = readPolicy(req);
  if (!policy) {
    client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="nexo"\r\n\r\n');
    return;
  }
  if (!permitted(policy, host)) {
    log("DENY", `${host}:${port}`, "fuera de la política");
    const body = `nexo: ${host} no está permitido por el acceso a la red de este entorno`;
    client.end(`HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    return;
  }
  try {
    const ip = await resolvePublic(host);
    const upstream = net.connect({ host: ip, port });
    let connected = false;
    const fail = (reason) => {
      log("FAIL", `${host}:${port}`, `${ip} ${reason}`);
      upstream.destroy();
      if (connected) return client.destroy();
      const body = `nexo: no se pudo conectar con ${host} (${reason})`;
      client.end(`HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    };
    upstream.setTimeout(CONNECT_TIMEOUT_MS, () => fail("tiempo de conexión agotado"));
    upstream.once("connect", () => {
      connected = true;
      upstream.removeAllListeners("timeout");
      capped(upstream);
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      capped(client).pipe(upstream);
    });
    upstream.on("error", (err) => fail(err.code ?? err.message));
    client.on("close", () => upstream.destroy());
    log("CONNECT", `${host}:${port}`);
  } catch (err) {
    log("DENY", `${host}:${port}`, err.message);
    client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
  }
});

server.listen(PORT, "0.0.0.0", () => console.log(`egress escuchando en ${PORT}`));
