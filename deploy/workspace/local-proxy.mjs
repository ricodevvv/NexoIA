import http from "node:http";
import net from "node:net";

const upstream = new URL(process.env.NEXO_UPSTREAM_PROXY ?? "");
const auth = `Basic ${Buffer.from(`${decodeURIComponent(upstream.username)}:${decodeURIComponent(upstream.password)}`).toString("base64")}`;
const upstreamHost = upstream.hostname;
const upstreamPort = Number(upstream.port || 80);
const port = Number(process.env.NEXO_LOCAL_PROXY_PORT ?? 3128);

/**
 * Proxy local del pod. Muchos programas (Java, el `HttpURLConnection` que usan
 * los plugins de Gradle, algunos CLIs) no saben mandar credenciales al proxy,
 * así que todo el pod apunta a este sin usuario ni contraseña y aquí se añade
 * la política firmada antes de reenviar al proxy de salida. Solo escucha en
 * localhost.
 */
const server = http.createServer((req, res) => {
  const headers = { ...req.headers, "proxy-authorization": auth };
  delete headers["proxy-connection"];
  const forward = http.request({ host: upstreamHost, port: upstreamPort, method: req.method, path: req.url, headers }, (up) => {
    res.writeHead(up.statusCode ?? 502, up.headers);
    up.pipe(res);
  });
  forward.on("error", () => (res.headersSent ? res.destroy() : res.writeHead(502).end("nexo: el proxy de salida no responde")));
  req.pipe(forward);
});

server.on("connect", (req, client, head) => {
  const target = String(req.url);
  const up = net.connect({ host: upstreamHost, port: upstreamPort }, () => {
    up.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\nProxy-Authorization: ${auth}\r\n\r\n`);
    if (head.length) up.write(head);
    up.pipe(client);
    client.pipe(up);
  });
  const close = () => {
    up.destroy();
    client.destroy();
  };
  up.on("error", () => {
    if (!client.writableEnded) client.end("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n");
    close();
  });
  client.on("error", close);
  up.on("close", () => client.destroy());
  client.on("close", () => up.destroy());
});

server.on("clientError", (_err, socket) => socket.destroy());
server.listen(port, "127.0.0.1");
