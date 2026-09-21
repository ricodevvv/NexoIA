import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { safeFetch } from "@/lib/safe-url";
import { listModels, remoteModelId } from "./models";
import type { ModelInfo } from "./types";

const PROMPT =
  "Escribe un título de 2 a 6 palabras para una conversación que empieza con el mensaje de abajo. En el mismo idioma del mensaje, sin comillas, sin punto final y sin emojis. Responde solo el título.";

function clean(raw: string) {
  const title = raw
    .replace(/^["'«“]+|["'»”.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return title.length > 80 ? `${title.slice(0, 77)}…` : title;
}

function openaiTitleModel() {
  const ids = listModels()
    .filter((m) => m.provider === "openai")
    .map((m) => m.id);
  return ids.find((id) => /nano|mini/.test(id)) ?? ids[0];
}

/**
 * Pide al proveedor del chat un título corto para la conversación. Usa el
 * modelo más barato que tenga a mano. Devuelve null si algo falla, y en ese
 * caso se queda el título provisional.
 */
export async function generateTitle(model: ModelInfo, apiKey: string, text: string, signal: AbortSignal) {
  const input = text.slice(0, 2000);
  try {
    if (model.provider === "anthropic") {
      const client = new Anthropic({ apiKey, maxRetries: 0 });
      const res = await client.messages.create(
        {
          model: "claude-haiku-4-5",
          max_tokens: 40,
          system: PROMPT,
          messages: [{ role: "user", content: input }],
        },
        { signal, timeout: 15_000 },
      );
      const block = res.content.find((b) => b.type === "text");
      return block ? clean(block.text) || null : null;
    }
    if (model.provider === "openai") {
      const client = new OpenAI({ apiKey, maxRetries: 0 });
      const titleModel = openaiTitleModel() ?? model.id;
      const res = await client.responses.create(
        {
          model: titleModel,
          instructions: PROMPT,
          input,
          store: false,
          max_output_tokens: 400,
          ...(/^(gpt-5|o\d)/.test(titleModel) ? { reasoning: { effort: "minimal" as const } } : {}),
        },
        { signal, timeout: 15_000 },
      );
      return clean(res.output_text) || null;
    }
    const client = new OpenAI({ apiKey: apiKey || "sin-key", baseURL: model.baseURL ?? process.env.COMPAT_BASE_URL,
      maxRetries: 0,
      ...(model.endpointId ? { fetch: safeFetch } : {}),
    });
    const res = await client.chat.completions.create(
      {
        model: remoteModelId(model.id),
        max_tokens: 30,
        messages: [
          { role: "system", content: PROMPT },
          { role: "user", content: input },
        ],
      },
      { signal, timeout: 15_000 },
    );
    return clean(res.choices[0]?.message.content ?? "") || null;
  } catch {
    return null;
  }
}
