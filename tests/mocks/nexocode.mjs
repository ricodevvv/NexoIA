import http from "node:http";

const PORT = Number(process.env.MOCK_NEXOCODE_PORT ?? 4130);
const AUTH = `Basic ${Buffer.from("nexocode:clave-de-prueba").toString("base64")}`;

let seq = 0;
const id = (prefix) => `${prefix}_${String(Date.now()).padStart(13, "0")}${String(++seq).padStart(4, "0")}`;
const sessions = new Map();
const clients = new Set();
const pending = new Map();
const status = new Map();
const questions = new Map();
let changed = false;

function emit(type, properties) {
  const line = `data: ${JSON.stringify({ id: id("evt"), type, properties })}\n\n`;
  for (const res of clients) res.write(line);
}

function json(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

function addMessage(session, role, parts) {
  const info = { id: id("msg"), sessionID: session.id, role, time: { created: Date.now() }, modelID: "mock-1" };
  const message = { info, parts: parts.map((p) => ({ id: id("prt"), messageID: info.id, sessionID: session.id, ...p })) };
  session.messages.push(message);
  emit("message.updated", { sessionID: session.id, info });
  for (const part of message.parts) emit("message.part.updated", { sessionID: session.id, part });
  return message;
}

const FILES = [
  ["pom.xml", "<project>\n  <artifactId>mi-plugin</artifactId>\n</project>"],
  ["src/main/resources/plugin.yml", "name: MiPlugin\nmain: dev.nexo.MiPlugin\nversion: 1.0"],
  ["src/main/java/dev/nexo/MiPlugin.java", "public final class MiPlugin extends JavaPlugin {\n  @Override\n  public void onEnable() {}\n}"],
];

async function scaffold(session) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const pause = Number(process.env.MOCK_NEXOCODE_STEP_MS ?? 30);
  const msg = addMessage(session, "assistant", [{ type: "reasoning", text: "Armo la estructura base de un plugin de Spigot en Java." }]);
  await wait(pause);
  const text = { id: id("prt"), messageID: msg.info.id, sessionID: session.id, type: "text", text: "Va, te armo un template listo para compilar con Maven." };
  msg.parts.push(text);
  emit("message.part.updated", { sessionID: session.id, part: text });
  const steps = [
    { tool: "bash", input: { command: "mkdir -p src/main/java/dev/nexo src/main/resources", description: "Crea las carpetas del proyecto" }, output: "" },
    ...FILES.map(([file, content]) => ({ tool: "write", input: { filePath: `/proyecto/${file}`, content }, output: "Wrote file successfully." })),
  ];
  for (const step of steps) {
    const part = { id: id("prt"), messageID: msg.info.id, sessionID: session.id, type: "tool", tool: step.tool, callID: id("call"), state: { status: "running", input: step.input, time: { start: Date.now() } } };
    msg.parts.push(part);
    emit("message.part.updated", { sessionID: session.id, part });
    await wait(pause);
    part.state = { status: "completed", input: step.input, output: step.output, title: step.tool, metadata: {}, time: { start: 0, end: 0 } };
    emit("message.part.updated", { sessionID: session.id, part });
  }
  changed = true;
}

async function run(session, text) {
  status.set(session.id, "busy");
  emit("session.status", { sessionID: session.id, status: { type: "busy" } });
  addMessage(session, "user", [{ type: "text", text }]);
  if (/#archivos/.test(text)) await scaffold(session);
  let chosen = null;
  if (/#pregunta/.test(text)) {
    const info = {
      id: id("que"),
      sessionID: session.id,
      questions: [
        {
          header: "Versión",
          question: "¿Para qué versión de Minecraft hago el plugin?",
          options: [
            { label: "1.8.8", description: "La clásica para PvP" },
            { label: "1.20.4", description: "Estable y con buena API" },
            { label: "1.21", description: "La más nueva" },
          ],
        },
      ],
    };
    const answers = await new Promise((resolve) => {
      questions.set(info.id, { info, resolve });
      emit("question.asked", info);
    });
    questions.delete(info.id);
    if (answers) emit("question.replied", { sessionID: session.id, requestID: info.id, answers });
    else emit("question.rejected", { sessionID: session.id, requestID: info.id });
    chosen = answers?.[0]?.join(", ") ?? "la que yo elija";
  }
  if (/#comando/.test(text)) {
    const tool = { type: "tool", tool: "bash", callID: "call_1", state: { status: "running", input: { command: "npm test", description: "Corre las pruebas" }, time: { start: Date.now() } } };
    const msg = addMessage(session, "assistant", [tool]);
    const permissionID = id("per");
    const info = { id: permissionID, sessionID: session.id, permission: "bash", patterns: ["npm test"], metadata: { command: "npm test" }, always: ["npm *"] };
    const reply = await new Promise((resolve) => {
      pending.set(permissionID, { info, resolve });
      emit("permission.asked", info);
    });
    emit("permission.replied", { sessionID: session.id, requestID: permissionID, reply });
    const part = msg.parts[0];
    part.state =
      reply === "reject"
        ? { status: "error", input: part.state.input, error: "El usuario rechazó el permiso", time: { start: 0, end: 0 } }
        : { status: "completed", input: part.state.input, output: "12 pruebas pasaron", title: "npm test", metadata: {}, time: { start: 0, end: 0 } };
    emit("message.part.updated", { sessionID: session.id, part });
    if (reply !== "reject") changed = true;
  }
  const answer = addMessage(session, "assistant", [{ type: "text", text: "" }]);
  const partID = answer.parts[0].id;
  let full = "";
  for (const word of chosen ? ["Perfecto, ", `lo hago para ${chosen}.`] : ["Listo, ", "las pruebas ", "pasan."]) {
    full += word;
    emit("message.part.delta", { sessionID: session.id, messageID: answer.info.id, partID, field: "text", delta: word });
    await new Promise((r) => setTimeout(r, 30));
  }
  answer.parts[0].text = full;
  status.set(session.id, "idle");
  emit("session.status", { sessionID: session.id, status: { type: "idle" } });
  emit("session.idle", { sessionID: session.id });
}

/**
 * Servidor falso de nexocode para las pruebas: la misma API y los mismos
 * eventos que `nexocode serve`, con un agente que pide permiso para correr
 * un comando cuando el mensaje dice #comando.
 */
const server = http.createServer(async (req, res) => {
  if (req.headers.authorization !== AUTH) return json(res, 401, { name: "Unauthorized" });
  const url = new URL(req.url, "http://x");
  let body = "";
  for await (const chunk of req) body += chunk;
  const data = body ? JSON.parse(body) : {};
  const path = url.pathname;
  let m;

  if (path === "/event") {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ id: id("evt"), type: "server.connected", properties: {} })}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }
  if (path === "/config/providers") {
    return json(res, 200, { providers: [{ id: "mock", name: "Mock", models: { "mock-1": { id: "mock-1", name: "Mock 1" } } }], default: { mock: "mock-1" } });
  }
  if (path === "/vcs/diff") {
    return json(res, 200, changed ? [{ file: "src/app.js", patch: "--- a/src/app.js\n+++ b/src/app.js\n@@ -1 +1 @@\n-viejo\n+nuevo\n", additions: 1, deletions: 1, status: "modified" }] : []);
  }
  if (path === "/question" && req.method === "GET") {
    return json(res, 200, [...questions.values()].map((q) => q.info));
  }
  if ((m = path.match(/^\/question\/([^/]+)\/(reply|reject)$/))) {
    questions.get(m[1])?.resolve(m[2] === "reply" ? data.answers : null);
    return json(res, 200, true);
  }
  if (path === "/permission" && req.method === "GET") {
    return json(res, 200, [...pending.values()].map((p) => p.info));
  }
  if (path === "/session/status") {
    return json(res, 200, Object.fromEntries([...status].map(([k, v]) => [k, { type: v }])));
  }
  if (path === "/session" && req.method === "GET") {
    return json(res, 200, [...sessions.values()].map((s) => s.info));
  }
  if (path === "/session" && req.method === "POST") {
    const info = { id: id("ses"), title: data.title ?? "Nueva sesión", directory: url.searchParams.get("directory") ?? "/", time: { created: Date.now(), updated: Date.now() } };
    sessions.set(info.id, { id: info.id, info, messages: [] });
    return json(res, 200, info);
  }
  if ((m = path.match(/^\/session\/([^/]+)$/))) {
    const s = sessions.get(m[1]);
    if (!s) return json(res, 404, { name: "NotFound" });
    if (req.method === "DELETE") {
      sessions.delete(m[1]);
      return json(res, 200, true);
    }
    return json(res, 200, s.info);
  }
  if ((m = path.match(/^\/session\/([^/]+)\/message$/))) {
    return json(res, 200, sessions.get(m[1])?.messages ?? []);
  }
  if ((m = path.match(/^\/session\/([^/]+)\/prompt_async$/))) {
    const s = sessions.get(m[1]);
    const text = data.parts?.find((p) => p.type === "text")?.text ?? "";
    if (s.messages.length === 0) {
      s.info.title = text.replace(/#\w+/g, "").trim().slice(0, 40) || s.info.title;
      emit("session.updated", { sessionID: s.id, info: s.info });
    }
    run(s, text);
    return json(res, 204);
  }
  if ((m = path.match(/^\/session\/([^/]+)\/abort$/))) return json(res, 200, true);
  if ((m = path.match(/^\/permission\/([^/]+)\/reply$/))) {
    pending.get(m[1])?.resolve(data.reply);
    pending.delete(m[1]);
    return json(res, 200, true);
  }
  json(res, 404, { name: "NotFound", path });
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock nexocode en :${PORT}`));
