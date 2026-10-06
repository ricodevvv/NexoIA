import type { Metadata } from "next";
import Link from "next/link";
import { modelOptions } from "@/lib/ai/options";
import { apiBaseUrl } from "@/lib/platform/config";
import { requireUser } from "@/lib/session";
import { CodeBlock } from "@/components/chat/code-block";
import { CodeTabs } from "@/components/platform/code-tabs";
import { PageHeader } from "@/components/ui/page-header";
import styles from "@/components/platform/docs.module.css";

export const metadata: Metadata = { title: "Documentación de la API" };

const PARAMS = [
  ["model", "string", "Sí", "El id del modelo, tal como aparece en Modelos. Por ejemplo claude-opus-5-5."],
  ["messages", "array", "Sí", "La conversación. Roles: system, developer, user y assistant. El contenido puede ser texto o partes con text e image_url."],
  ["stream", "boolean", "No", "Si es true, la respuesta llega por Server-Sent Events pedazo por pedazo."],
  ["stream_options.include_usage", "boolean", "No", "Con streaming, manda un último evento con los tokens usados."],
  ["max_tokens / max_completion_tokens", "integer", "No", "Tope de tokens de salida. Por defecto, el máximo del modelo."],
  ["reasoning_effort", "string", "No", "low, medium, high, xhigh o max. Cuánto piensa el modelo antes de responder. Por defecto medium."],
];

const ERRORS = [
  ["400", "invalid_request_error", "Falta algo en la petición o el formato no es válido."],
  ["401", "authentication_error", "La key falta, no existe, expiró o fue revocada."],
  ["402", "insufficient_quota", "Llegaste al límite diario de tu plan o el modelo es del plan Pro."],
  ["404", "not_found_error", "El modelo no existe o no está disponible para tu cuenta."],
  ["429", "rate_limit_error", "Demasiadas peticiones. Espera los segundos del header Retry-After."],
  ["502", "api_error", "El proveedor del modelo falló. Vuelve a intentar."],
];

const RESPONSE = `{
  "id": "chatcmpl-3f2a9c1e7b4d4a8e9c0b1a2d",
  "object": "chat.completion",
  "created": 1791315161,
  "model": "claude-opus-5-5",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "¡Hola! Puedo ayudarte con…" },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 18, "completion_tokens": 42, "total_tokens": 60 }
}`;

const STREAM = `data: {"id":"chatcmpl-…","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-…","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"¡Hola!"},"finish_reason":null}]}

data: {"id":"chatcmpl-…","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]`;

const SECTIONS = [
  ["inicio", "Inicio rápido"],
  ["autenticacion", "Autenticación"],
  ["modelos", "Listar modelos"],
  ["chat", "Chat completions"],
  ["streaming", "Streaming"],
  ["imagenes", "Imágenes"],
  ["errores", "Errores"],
  ["limites", "Límites y costos"],
];

export default async function DocsPage() {
  const user = await requireUser();
  const models = await modelOptions(user.id);
  const baseUrl = apiBaseUrl();
  const model = models.find((m) => m.available)?.id ?? "claude-opus-5-5";

  return (
    <div className="page">
      <div className="page-inner">
        <PageHeader
          eyebrow="Plataforma"
          title="API de Nexo"
          description="Una API compatible con OpenAI para usar cualquier modelo de tu cuenta: Claude, GPT y tus endpoints propios, con una sola key."
        />
        <div className={styles.layout}>
          <nav className={styles.toc} aria-label="En esta página">
            <p className="label">En esta página</p>
            <ul>
              {SECTIONS.map(([id, title]) => (
                <li key={id}>
                  <a href={`#${id}`}>{title}</a>
                </li>
              ))}
            </ul>
          </nav>
          <article className={styles.doc}>
            <section id="inicio">
              <h2>Inicio rápido</h2>
              <p>
                Si ya usas el SDK de OpenAI, solo cambia la URL base y la key. Crea una en <Link href="/platform/keys">API keys</Link> y guárdala en la
                variable <code className="code-inline">NEXO_API_KEY</code>.
              </p>
              <div className={styles.baseUrl}>
                <span className="label">URL base</span>
                <code>{baseUrl}</code>
              </div>
              <CodeTabs input={{ baseUrl, model, messages: [{ role: "user", content: "Explícame qué es un LLM en dos frases." }] }} />
            </section>

            <section id="autenticacion">
              <h2>Autenticación</h2>
              <p>
                Manda la key en el header <code className="code-inline">Authorization: Bearer nexo-sk-…</code>. También aceptamos{" "}
                <code className="code-inline">x-api-key</code>. Las keys se ven completas una sola vez al crearlas; en la base solo guardamos un hash.
              </p>
            </section>

            <section id="modelos">
              <h2>Listar modelos</h2>
              <p>
                <span className="tag tag-accent">GET</span> <code className="code-inline">/models</code> devuelve los modelos que tu key puede usar ahora mismo.
              </p>
              <CodeBlock code={`curl ${baseUrl}/models \\\n  -H "Authorization: Bearer $NEXO_API_KEY"`} lang="bash" />
            </section>

            <section id="chat">
              <h2>Chat completions</h2>
              <p>
                <span className="tag tag-accent">POST</span> <code className="code-inline">/chat/completions</code> genera una respuesta para la conversación que
                le mandes. No guarda nada en tu historial de chats, pero sí aparece en tus logs y en el uso.
              </p>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Parámetro</th>
                      <th scope="col">Tipo</th>
                      <th scope="col">Requerido</th>
                      <th scope="col">Qué hace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PARAMS.map(([name, type, required, text]) => (
                      <tr key={name}>
                        <th scope="row">
                          <code className="code-inline">{name}</code>
                        </th>
                        <td>{type}</td>
                        <td>{required}</td>
                        <td className="wrap">{text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>Respuesta:</p>
              <CodeBlock code={RESPONSE} lang="json" />
              <p>
                Si el modelo razona, el resumen del razonamiento llega en <code className="code-inline">message.reasoning_content</code>. Los parámetros que no
                usamos (como <code className="code-inline">temperature</code>) se ignoran sin error.
              </p>
            </section>

            <section id="streaming">
              <h2>Streaming</h2>
              <p>
                Con <code className="code-inline">&quot;stream&quot;: true</code> la respuesta es <code className="code-inline">text/event-stream</code> con el
                mismo formato que OpenAI y termina con <code className="code-inline">data: [DONE]</code>.
              </p>
              <CodeBlock code={STREAM} lang="text" />
              <CodeTabs initial="typescript" input={{ baseUrl, model, stream: true, messages: [{ role: "user", content: "Cuéntame un dato curioso." }] }} />
            </section>

            <section id="imagenes">
              <h2>Imágenes</h2>
              <p>
                Para los modelos con visión, manda la imagen como parte <code className="code-inline">image_url</code> con una data URL en base64 (PNG, JPEG, GIF o
                WebP, hasta 8 MB). No descargamos URLs externas.
              </p>
              <CodeBlock
                code={`{
  "role": "user",
  "content": [
    { "type": "text", "text": "¿Qué hay en esta foto?" },
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,iVBORw0KG…" } }
  ]
}`}
                lang="json"
              />
            </section>

            <section id="errores">
              <h2>Errores</h2>
              <p>Los errores tienen la forma de OpenAI, así que tu SDK los convierte en excepciones normales.</p>
              <CodeBlock code={`{ "error": { "message": "La API key no es válida o fue revocada.", "type": "authentication_error", "code": null } }`} lang="json" />
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Código</th>
                      <th scope="col">Tipo</th>
                      <th scope="col">Cuándo pasa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ERRORS.map(([code, type, text]) => (
                      <tr key={code}>
                        <th scope="row">{code}</th>
                        <td>
                          <code className="code-inline">{type}</code>
                        </td>
                        <td className="wrap">{text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="limites">
              <h2>Límites y costos</h2>
              <p>
                Cada key puede hacer 60 peticiones por minuto y tu cuenta 120 sumando todas. Las peticiones cuentan para el límite diario de tu plan, salvo
                cuando el modelo corre con tu propia key de proveedor. Mira el detalle en <Link href="/platform/limits">Límites</Link> y lo que llevas gastado en{" "}
                <Link href="/platform/usage">Uso y costos</Link>.
              </p>
            </section>
          </article>
        </div>
      </div>
    </div>
  );
}
