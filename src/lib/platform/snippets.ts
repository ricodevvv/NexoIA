export type SnippetInput = {
  baseUrl: string;
  model: string;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  stream?: boolean;
  maxTokens?: number;
  effort?: string;
};

export type SnippetLang = "curl" | "python" | "typescript";

function messagesOf(input: SnippetInput) {
  return [...(input.system?.trim() ? [{ role: "system", content: input.system }] : []), ...input.messages];
}

function pyString(text: string) {
  return JSON.stringify(text);
}

/**
 * Código listo para copiar que hace la misma petición contra la API de Nexo,
 * en curl, Python o TypeScript con el SDK oficial de OpenAI.
 */
export function buildSnippet(lang: SnippetLang, input: SnippetInput) {
  const messages = messagesOf(input);
  const extra: Record<string, unknown> = {};
  if (input.maxTokens) extra.max_tokens = input.maxTokens;
  if (input.effort && input.effort !== "medium") extra.reasoning_effort = input.effort;
  if (input.stream) extra.stream = true;

  if (lang === "curl") {
    const body = JSON.stringify({ model: input.model, messages, ...extra }, null, 2);
    return [
      `curl ${input.baseUrl}/chat/completions \\`,
      `  -H "Authorization: Bearer $NEXO_API_KEY" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '${body.replaceAll("'", "'\\''")}'`,
    ].join("\n");
  }

  if (lang === "python") {
    const lines = [
      "import os",
      "from openai import OpenAI",
      "",
      "client = OpenAI(",
      `    base_url=${pyString(input.baseUrl)},`,
      '    api_key=os.environ["NEXO_API_KEY"],',
      ")",
      "",
      `${input.stream ? "stream" : "response"} = client.chat.completions.create(`,
      `    model=${pyString(input.model)},`,
      "    messages=[",
      ...messages.map((m) => `        {"role": ${pyString(m.role)}, "content": ${pyString(m.content)}},`),
      "    ],",
      ...(input.maxTokens ? [`    max_tokens=${input.maxTokens},`] : []),
      ...(extra.reasoning_effort ? [`    reasoning_effort=${pyString(String(extra.reasoning_effort))},`] : []),
      ...(input.stream ? ["    stream=True,"] : []),
      ")",
      "",
      ...(input.stream
        ? ["for chunk in stream:", '    print(chunk.choices[0].delta.content or "", end="", flush=True)']
        : ["print(response.choices[0].message.content)"]),
    ];
    return lines.join("\n");
  }

  const lines = [
    'import OpenAI from "openai";',
    "",
    "const client = new OpenAI({",
    `  baseURL: ${JSON.stringify(input.baseUrl)},`,
    "  apiKey: process.env.NEXO_API_KEY,",
    "});",
    "",
    `const ${input.stream ? "stream" : "response"} = await client.chat.completions.create({`,
    `  model: ${JSON.stringify(input.model)},`,
    "  messages: [",
    ...messages.map((m) => `    { role: ${JSON.stringify(m.role)}, content: ${JSON.stringify(m.content)} },`),
    "  ],",
    ...(input.maxTokens ? [`  max_tokens: ${input.maxTokens},`] : []),
    ...(extra.reasoning_effort ? [`  reasoning_effort: ${JSON.stringify(extra.reasoning_effort)},`] : []),
    ...(input.stream ? ["  stream: true,"] : []),
    "});",
    "",
    ...(input.stream
      ? ["for await (const chunk of stream) {", '  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");', "}"]
      : ["console.log(response.choices[0].message.content);"]),
  ];
  return lines.join("\n");
}
