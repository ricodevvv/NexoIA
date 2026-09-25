import { readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createInterface } from "node:readline";

const NEXO_URL = (process.env.NEXO_URL ?? "").replace(/\/+$/, "");
const NEXO_TOKEN = process.env.NEXO_TOKEN ?? "";
const WORKSPACE = process.env.NEXO_WORKSPACE_DIR ?? "/home/nexo/workspace";
const MAX_BYTES = 50 * 1024 * 1024;

const TOOL = {
  name: "present_files",
  description:
    "Le entrega archivos al usuario en el chat, listos para descargar. Úsala siempre que el usuario pida un archivo (un .jar, un .zip, una imagen, un build, un reporte) o cuando termines de generar algo que se va a llevar. No digas que el archivo 'está en el workspace': preséntalo con esta tool. Acepta rutas relativas a la carpeta del proyecto o absolutas. Para entregar una carpeta entera, comprímela primero en un .zip.",
  inputSchema: {
    type: "object",
    properties: {
      paths: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 10, description: "Rutas de los archivos a entregar." },
    },
    required: ["paths"],
  },
};

const REPOS_TOOL = {
  name: "github_repos",
  description:
    "Lista las cuentas y organizaciones de GitHub que el usuario conectó en Nexo y los repos a los que tienes acceso, con su rama por defecto y si puedes hacer push. Úsala antes de clonar un repo del usuario o cuando pregunte qué repos hay. git y gh ya se autentican solos con esa cuenta.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string", description: "Filtro opcional por nombre de repo u organización." } },
  },
};

async function repos(query) {
  const res = await fetch(`${NEXO_URL}/api/workspace/github/repos`, { headers: { Authorization: `Bearer ${NEXO_TOKEN}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Nexo respondió ${res.status}`);
  const q = String(query ?? "").trim().toLowerCase();
  const list = data.repos.filter((r) => !q || r.fullName.toLowerCase().includes(q));
  const lines = [
    `Cuenta de GitHub: ${data.login}`,
    `Instalada en: ${data.installations.map((i) => `${i.account} (${i.type === "Organization" ? "organización" : "usuario"}, ${i.selection === "all" ? "todos los repos" : "repos elegidos"})`).join(", ") || "ninguna cuenta"}`,
    "",
    ...list.map((r) => `${r.fullName}${r.private ? " · privado" : ""} · rama ${r.defaultBranch}${r.canPush ? "" : " · solo lectura"}${r.description ? ` · ${r.description}` : ""}`),
  ];
  if (!list.length) lines.push(q ? `Ningún repo coincide con "${query}".` : "No hay repos compartidos. El usuario puede elegirlos en Ajustes → GitHub.");
  return lines.join("\n");
}

function send(message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
}

async function present(paths) {
  const form = new FormData();
  for (const raw of paths) {
    const path = resolve(WORKSPACE, raw);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) throw new Error(`No existe el archivo ${raw}`);
    if (info.size > MAX_BYTES) throw new Error(`${raw} pasa de 50 MB; comprímelo o divídelo`);
    form.append("file", new Blob([await readFile(path)]), basename(path));
  }
  const res = await fetch(`${NEXO_URL}/api/workspace/files`, { method: "POST", headers: { Authorization: `Bearer ${NEXO_TOKEN}` }, body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Nexo respondió ${res.status}`);
  return data.files;
}

async function handle(msg) {
  if (msg.method === "initialize") {
    return send({
      id: msg.id,
      result: { protocolVersion: msg.params?.protocolVersion ?? "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "nexo", version: "1.0.0" } },
    });
  }
  if (msg.method === "ping") return send({ id: msg.id, result: {} });
  if (msg.method === "tools/list") return send({ id: msg.id, result: { tools: [TOOL, REPOS_TOOL] } });
  if (msg.method === "tools/call" && msg.params?.name === REPOS_TOOL.name) {
    try {
      return send({ id: msg.id, result: { content: [{ type: "text", text: await repos(msg.params.arguments?.query) }] } });
    } catch (err) {
      return send({ id: msg.id, result: { content: [{ type: "text", text: `No se pudieron listar los repos: ${err.message}` }], isError: true } });
    }
  }
  if (msg.method === "tools/call") {
    try {
      if (msg.params?.name !== TOOL.name) throw new Error(`Tool desconocida: ${msg.params?.name}`);
      const files = await present(msg.params.arguments?.paths ?? []);
      const names = files.map((f) => f.name).join(", ");
      const text = `El usuario ya tiene en el chat, listos para descargar: ${names}.\n<!--nexo-files:${JSON.stringify(files)}-->`;
      return send({ id: msg.id, result: { content: [{ type: "text", text }] } });
    } catch (err) {
      return send({ id: msg.id, result: { content: [{ type: "text", text: `No se pudo entregar: ${err.message}` }], isError: true } });
    }
  }
  if (msg.id !== undefined) send({ id: msg.id, error: { code: -32601, message: "Método no soportado" } });
}

createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  handle(msg);
});
