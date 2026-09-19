import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { runTurn } from "@/lib/ai/engine";
import { resolveKey } from "@/lib/ai/keys";
import { findModel } from "@/lib/ai/models";
import { systemPrompt } from "@/lib/ai/system";
import type { AttachmentData, ChatStreamEvent, MessagePart } from "@/lib/ai/types";
import { checkQuota, recordUsage } from "@/lib/billing/usage";
import { db, schema } from "@/lib/db";
import { openToolbox } from "@/lib/mcp";
import { apiUser, handleError, HttpError } from "@/lib/session";

export const maxDuration = 800;

const Body = z.object({
  conversationId: z.string().optional(),
  text: z.string().max(200_000).default(""),
  attachmentIds: z.array(z.string()).max(20).default([]),
  model: z.string(),
  effort: z.enum(["low", "medium", "high"]).default("medium"),
  webSearch: z.boolean().default(false),
  regenerate: z.boolean().default(false),
  editMessageId: z.string().optional(),
});

function titleFrom(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "Nuevo chat";
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}

async function loadConversation(userId: string, id: string) {
  const conv = await db.query.conversation.findFirst({
    where: and(eq(schema.conversation.id, id), eq(schema.conversation.userId, userId)),
  });
  if (!conv) throw new HttpError(404, "Conversación no encontrada");
  return conv;
}

async function truncateFrom(conversationId: string, messageId: string) {
  const target = await db.query.message.findFirst({
    where: and(eq(schema.message.id, messageId), eq(schema.message.conversationId, conversationId)),
  });
  if (!target) throw new HttpError(404, "Mensaje no encontrado");
  await db
    .delete(schema.message)
    .where(and(eq(schema.message.conversationId, conversationId), gte(schema.message.createdAt, target.createdAt)));
}

async function dropTrailingAssistant(conversationId: string) {
  const rows = await db.query.message.findMany({
    where: eq(schema.message.conversationId, conversationId),
    orderBy: asc(schema.message.createdAt),
  });
  const lastUser = rows.findLastIndex((m) => m.role === "user");
  if (lastUser === -1) throw new HttpError(400, "No hay mensaje que regenerar");
  const stale = rows.slice(lastUser + 1).map((m) => m.id);
  if (stale.length) await db.delete(schema.message).where(inArray(schema.message.id, stale));
}

export async function POST(request: Request) {
  try {
    const user = await apiUser();
    const body = Body.parse(await request.json());

    const model = findModel(body.model);
    if (!model) throw new HttpError(400, "Modelo desconocido");
    const key = await resolveKey(user.id, model.provider);
    if (!key) throw new HttpError(400, `No hay API key configurada para ${model.label}. Agrégala en Ajustes.`);
    const blocked = await checkQuota(user.id, model, key.byok);
    if (blocked) throw new HttpError(402, blocked);

    const isNew = !body.conversationId;
    const conversation = body.conversationId
      ? await loadConversation(user.id, body.conversationId)
      : (
          await db
            .insert(schema.conversation)
            .values({ id: nanoid(), userId: user.id, title: titleFrom(body.text), model: model.id })
            .returning()
        )[0];

    if (body.editMessageId) await truncateFrom(conversation.id, body.editMessageId);
    if (body.regenerate) await dropTrailingAssistant(conversation.id);

    const owned = body.attachmentIds.length
      ? await db
          .select({ id: schema.attachment.id, name: schema.attachment.name, mediaType: schema.attachment.mediaType })
          .from(schema.attachment)
          .where(and(eq(schema.attachment.userId, user.id), inArray(schema.attachment.id, body.attachmentIds)))
      : [];

    const userMessageId = nanoid();
    if (!body.regenerate) {
      if (!body.text.trim() && !owned.length) throw new HttpError(400, "El mensaje está vacío");
      const parts: MessagePart[] = [
        ...owned.map((a) => ({ type: "attachment" as const, attachmentId: a.id, name: a.name, mediaType: a.mediaType })),
        ...(body.text.trim() ? [{ type: "text" as const, text: body.text }] : []),
      ];
      await db.insert(schema.message).values({ id: userMessageId, conversationId: conversation.id, role: "user", parts });
    }

    const history = await db.query.message.findMany({
      where: eq(schema.message.conversationId, conversation.id),
      orderBy: asc(schema.message.createdAt),
    });
    const attachmentIds = history.flatMap((m) =>
      m.parts.flatMap((p) => (p.type === "attachment" ? [p.attachmentId] : [])),
    );
    const files = attachmentIds.length
      ? await db
          .select()
          .from(schema.attachment)
          .where(and(eq(schema.attachment.userId, user.id), inArray(schema.attachment.id, attachmentIds)))
      : [];
    const attachments = new Map<string, AttachmentData>(files.map((f) => [f.id, f]));

    const assistantMessageId = nanoid();
    const controller = new AbortController();
    request.signal.addEventListener("abort", () => controller.abort());
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(sink) {
        let open = true;
        const send = (event: ChatStreamEvent) => {
          if (!open) return;
          try {
            sink.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            open = false;
          }
        };

        send({ type: "start", conversationId: conversation.id, userMessageId, assistantMessageId });
        if (isNew) send({ type: "title", title: conversation.title });

        const toolbox = await openToolbox(user.id);
        for (const error of toolbox.errors) send({ type: "notice", level: "warning", text: error });

        const outcome = await runTurn(
          {
            model,
            apiKey: key.apiKey,
            system: systemPrompt(user),
            history,
            attachments,
            tools: toolbox.tools,
            effort: body.effort,
            webSearch: body.webSearch,
          },
          (call, signal) => toolbox.call(call.id, call.name, call.input, signal),
          send,
          controller.signal,
        );
        await toolbox.close();

        if (outcome.parts.length) {
          await db.insert(schema.message).values({
            id: assistantMessageId,
            conversationId: conversation.id,
            role: "assistant",
            parts: outcome.parts,
            model: model.id,
            native: outcome.native,
          });
        }
        await db
          .update(schema.conversation)
          .set({ updatedAt: new Date(), model: model.id })
          .where(eq(schema.conversation.id, conversation.id));
        if (outcome.usage.inputTokens || outcome.usage.outputTokens) {
          await recordUsage(user.id, model.id, outcome.usage, key.byok);
        }

        send({ type: "done", usage: outcome.usage });
        if (open) sink.close();
      },
      cancel() {
        controller.abort();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Petición inválida" }, { status: 400 });
    return handleError(err);
  }
}
