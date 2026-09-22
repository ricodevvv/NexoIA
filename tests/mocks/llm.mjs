import http from "node:http";

const PORT = Number(process.env.MOCK_LLM_PORT ?? 4000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function send(res, delta, finish = null) {
  const chunk = { id: "mock", object: "chat.completion.chunk", created: 0, model: "mock", choices: [{ index: 0, delta, finish_reason: finish }] };
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
}

function textOf(message) {
  if (!message) return "";
  return typeof message.content === "string" ? message.content : message.content.map((p) => p.text ?? "").join(" | ");
}

async function words(res, text) {
  for (const word of text.split(/(?<= )/)) {
    send(res, { content: word });
    await sleep(10);
  }
}

function callTool(res, name, args) {
  send(res, { tool_calls: [{ index: 0, id: `call_${name}_${Date.now()}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] });
  send(res, {}, "tool_calls");
}

const COUNTER =
  'import { useState } from "react";\nexport default function App() {\n  const [n, setN] = useState(0);\n  return <div className="p-6"><h1>Contador: {n}</h1><button onClick={() => setN(n + 1)}>Sumar</button></div>;\n}';

const ANALYSIS =
  "import pandas as pd\nimport matplotlib.pyplot as plt\ndf = pd.read_csv('ventas.csv')\nprint(df)\ndf.plot(x='mes', y='ventas', kind='bar', legend=False)\nint(df.ventas.sum())";

const WIDGETS = [
  { type: "weather", location: "Ciudad de México", temperature: 23, condition: "Mayormente nublado", source: "Datos de ejemplo", days: ["jue", "vie", "sáb", "dom", "lun", "mar", "mié"].map((day, i) => ({ day, max: 24 - (i > 5 ? 1 : 0), rain: 10 + i * 5 })) },
  { type: "chart", title: "Usuarios activos de tu chat (demo)", subtitle: "Usuarios", kind: "line", categories: ["Abr", "May", "Jun", "Jul", "Ago", "Sep"], series: [{ name: "Web", values: [120, 180, 260, 340, 470, 620] }, { name: "Móvil", values: [80, 150, 210, 330, 410, 580] }] },
  { type: "steps", steps: [{ title: "Crea el proyecto", description: "Inicia un proyecto con Vite + React + TypeScript y agrega Tailwind para los estilos." }, { title: "Arma el layout", description: "Sidebar a la izquierda, lista de mensajes al centro y el composer fijo abajo." }, { title: "Conecta el modelo", description: "Crea un endpoint que llame a la API del modelo y devuelva la respuesta por streaming (SSE)." }] },
  { type: "recipe", title: "Chilaquiles verdes", description: "Receta de ejemplo con porciones ajustables", servings: 2, ingredients: [{ amount: 8, name: "tortillas en triángulos" }, { amount: 6, name: "tomates verdes" }, { amount: 2, name: "chiles serranos" }, { amount: 80, unit: "g", name: "queso fresco" }], steps: [{ title: "Fríe las tortillas", text: "Calienta aceite y fríe las tortillas hasta que estén doradas." }, { title: "Haz la salsa", text: "Hierve los tomates con los chiles y licúa con un poco de sal." }] },
  { type: "quiz", questions: [{ question: "¿Qué tecnología se usa para mostrar la respuesta mientras se escribe?", options: ["LocalStorage", "Streaming (SSE)", "Cookies"], answer: 1, explanation: "El servidor manda el texto en pedacitos por Server-Sent Events y la interfaz lo va pintando." }, { question: "¿Dónde conviene guardar las API keys?", options: ["En el frontend", "En el servidor"], answer: 1 }] },
  { type: "comparison", items: [{ name: "Next.js", rows: [{ label: "Tipo", value: "Full-stack" }, { label: "Streaming", value: "Nativo" }] }, { name: "Vite + Express", rows: [{ label: "Tipo", value: "Front + API separada" }, { label: "Streaming", value: "Manual con SSE" }] }, { name: "SvelteKit", rows: [{ label: "Tipo", value: "Full-stack" }, { label: "Streaming", value: "Nativo" }] }] },
  { type: "links", links: [{ title: "React", description: "La librería para construir la interfaz.", url: "https://react.dev/" }, { title: "react-markdown", description: "Renderiza el Markdown de las respuestas.", url: "https://github.com/remarkjs/react-markdown" }] },
  { type: "diagram", nodes: [{ id: "u", label: "Usuario", detail: "Escribe mensaje" }, { id: "i", label: "Interfaz", detail: "React + widgets", tone: "purple" }, { id: "s", label: "Servidor", detail: "Streaming SSE", tone: "purple" }, { id: "m", label: "Modelo IA", detail: "Genera respuesta", tone: "green" }, { id: "t", label: "Herramientas", detail: "Clima, búsqueda", tone: "green" }], edges: [{ from: "u", to: "i" }, { from: "i", to: "s" }, { from: "s", to: "m" }, { from: "s", to: "t" }] },
];

/**
 * Modelo falso compatible con Chat Completions. Responde según palabras clave
 * del último mensaje del usuario para ejercitar cada camino del motor.
 */
const server = http.createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (req.url !== "/v1/chat/completions") {
    res.writeHead(404).end();
    return;
  }
  const json = JSON.parse(body);
  const messages = json.messages;
  const system = messages[0]?.role === "system" ? messages[0].content : "";
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const firstUser = messages.find((m) => m.role === "user");
  const user = textOf(lastUser);
  const tools = (json.tools ?? []).map((t) => t.function.name);
  const last = messages.at(-1);

  if (!json.stream) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: "t", object: "chat.completion", created: 0, model: "mock", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: `"Título: ${textOf(last).slice(0, 24)}."` } }] }));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const sinceUser = messages.slice(messages.lastIndexOf(lastUser) + 1).filter((m) => m.role === "tool").length;
  if (/#widgets/.test(user) && tools.includes("show_widget")) {
    if (sinceUser < WIDGETS.length) {
      if (sinceUser === 0) await words(res, "Va, te hago una demo con todos los widgets. ");
      callTool(res, "show_widget", WIDGETS[sinceUser]);
    } else {
      await words(res, "En esta respuesta salieron: **clima, gráfica, pasos, receta, quiz, comparación, links y diagrama**.");
      send(res, {}, "stop");
    }
  } else if (last.role === "tool") {
    await words(res, `Resultado de la tool: ${last.content.split("\n")[0]}`);
    send(res, {}, "stop");
  } else if (/#hora/.test(user) && tools.some((t) => t.endsWith("__get_time"))) {
    send(res, { reasoning_content: "Necesito la hora." });
    callTool(res, tools.find((t) => t.endsWith("__get_time")), { zone: "UTC" });
  } else if (/#quien/.test(user) && tools.some((t) => t.endsWith("__whoami"))) {
    callTool(res, tools.find((t) => t.endsWith("__whoami")), {});
  } else if (/#busca (.+)/.test(user) && tools.includes("conversation_search")) {
    callTool(res, "conversation_search", { query: user.match(/#busca (.+)/)[1].trim() });
  } else if (/#artifact/.test(user) && tools.includes("artifact")) {
    callTool(res, "artifact", { identifier: "contador", title: "Contador", type: "react", content: COUNTER });
  } else if (/#python/.test(user) && tools.includes("run_python")) {
    callTool(res, "run_python", { code: ANALYSIS });
  } else if (/#recuerda/.test(user) && tools.includes("memory_save")) {
    callTool(res, "memory_save", { content: "Le gusta el café de Veracruz" });
  } else if (/#sistema/.test(user)) {
    const facts = {
      proyecto: /## Proyecto/.test(system),
      instrucciones: (system.match(/## Proyecto: [^\n]+\n[^\n]*\n\n([^\n]+)/) ?? [])[1] ?? null,
      estilo: (system.match(/Estilo de respuesta: ([^\n]+)/) ?? [])[1] ?? null,
      tools,
      primer_mensaje: textOf(firstUser).slice(0, 120),
    };
    await words(res, JSON.stringify(facts));
    send(res, {}, "stop");
  } else {
    await words(res, `Eco: ${user}. Historial: ${messages.length} mensajes. Una tabla:\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n\`\`\`ts\nconst x = 42;\n\`\`\``);
    send(res, {}, "stop");
  }
  res.write(`data: ${JSON.stringify({ id: "mock", object: "chat.completion.chunk", created: 0, model: "mock", choices: [], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock llm en :${PORT}`));
