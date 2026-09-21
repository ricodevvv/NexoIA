import { and, asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { builtinTools } from "@/lib/ai/builtins";
import { codeExecutionEnabled } from "@/lib/code-exec";
import { runTurn } from "@/lib/ai/engine";
import { defaultLeaf, pathTo } from "@/lib/branches";
import { findModelForUser, resolveModelKey } from "@/lib/ai/user-models";
import { systemPrompt } from "@/lib/ai/system";
import { generateTitle } from "@/lib/ai/title";
import type { AttachmentData, ChatStreamEvent, HistoryMessage, MessagePart } from "@/lib/ai/types";
import { checkQuota, recordUsage } from "@/lib/billing/usage";
import { db, schema } from "@/lib/db";
import { openToolbox } from "@/lib/mcp";
import { projectAccess, sharedAttachmentIds } from "@/lib/projects";
import { readFile } from "@/lib/storage";
import { getSettings, listMemories } from "@/lib/settings";
import { presetStyle } from "@/lib/styles";
import { clientIp, enforce, LIMITS } from "@/lib/rate-limit";
import { apiSession, handleError, HttpError } from "@/lib/session";
import { activeWorkspace } from "@/lib/workspace";

export const maxDuration = 800;

const Body = z.object({
  conversationId: z.string().optional(),
  projectId: z.string().optional(),
  text: z.string().max(200_000).default(""),
  attachmentIds: z.array(z.string()).max(20).default([]),
  model: z.string(),
  effort: z.enum(["low", "medium", "high"]).default("medium"),
  webSearch: z.boolean().default(false),
  research: z.boolean().default(false),
  regenerate: z.boolean().default(false),
  editMessageId: z.string().optional(),
  style: z.string().max(40).default("normal"),
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

async function resolveStyle(userId: string, id: string) {
  const preset = presetStyle(id);
  if (preset) return preset.instructions ? { name: preset.name, instructions: preset.instructions } : null;
  const custom = await db.query.responseStyle.findFirst({
    where: and(eq(schema.responseStyle.id, id), eq(schema.responseStyle.userId, userId)),
  });
  return custom ? { name: custom.name, instructions: custom.instructions } : null;
}

async function loadProject(userId: string, projectId: string | null) {
  if (!projectId) return null;
  const access = await projectAccess(userId, projectId);
  if (!access) return null;
  const { project } = access;
  const files = await db
    .select({ id: schema.attachment.id, name: schema.attachment.name, mediaType: schema.attachment.mediaType })
    .from(schema.projectFile)
    .innerJoin(schema.attachment, eq(schema.attachment.id, schema.projectFile.attachmentId))
    .where(eq(schema.projectFile.projectId, projectId))
    .orderBy(asc(schema.projectFile.createdAt));
  return { ...project, files };
}

function withProjectFiles(history: HistoryMessage[], files: { id: string; name: string; mediaType: string }[]) {
  if (!files.length) return history;
  const first = history.findIndex((m) => m.role === "user");
  if (first === -1) return history;
  const parts: MessagePart[] = files.map((f) => ({ type: "attachment", attachmentId: f.id, name: f.name, mediaType: f.mediaType }));
  return history.map((m, i) => (i === first ? { ...m, parts: [...parts, ...m.parts] } : m));
}

/**
 * Decide de qué mensaje cuelga lo nuevo. Editar crea una versión hermana del
 * mensaje editado; regenerar, una versión hermana de la respuesta; si no, se
 * sigue la rama activa. Nunca se borra nada.
 */
function resolveParent(
  rows: { id: string; parentId: string | null; role: string; createdAt: Date }[],
  leaf: string | null,
  body: { editMessageId?: string; regenerate: boolean },
) {
  if (body.editMessageId) {
    const target = rows.find((m) => m.id === body.editMessageId);
    if (!target || target.role !== "user") throw new HttpError(404, "Mensaje no encontrado");
    return target.parentId;
  }
  if (body.regenerate) {
    const lastUser = pathTo(rows, leaf).findLast((m) => m.role === "user");
    if (!lastUser) throw new HttpError(400, "No hay mensaje que regenerar");
    return lastUser.id;
  }
  return leaf;
}

export async function POST(request: Request) {
  try {
    const auth = await apiSession();
    const { user } = auth;
    await enforce([{ key: `chat:u:${user.id}`, ...LIMITS.chatUser }, { key: `chat:ip:${clientIp(request.headers)}`, ...LIMITS.chatIp }]);
    const body = Body.parse(await request.json());

    const model = await findModelForUser(user.id, body.model);
    if (!model) throw new HttpError(400, "Modelo desconocido");
    const key = await resolveModelKey(user.id, model);
    if (!key) throw new HttpError(400, `No hay API key configurada para ${model.label}. Agrégala en Ajustes.`);
    const blocked = await checkQuota(user.id, model, key.byok);
    if (blocked) throw new HttpError(402, blocked);

    const researching = body.research && model.webSearch !== null;
    const isNew = !body.conversationId;
    const conversation = body.conversationId
      ? await loadConversation(user.id, body.conversationId)
      : (
          await db
            .insert(schema.conversation)
            .values({
              id: nanoid(),
              userId: user.id,
              projectId: (await loadProject(user.id, body.projectId ?? null))?.id ?? null,
              title: titleFrom(body.text),
              model: model.id,
            })
            .returning()
        )[0];

    const tree = await db.query.message.findMany({
      where: eq(schema.message.conversationId, conversation.id),
      orderBy: asc(schema.message.createdAt),
    });
    const leaf = conversation.currentLeafId && tree.some((m) => m.id === conversation.currentLeafId) ? conversation.currentLeafId : defaultLeaf(tree);
    const parentId = resolveParent(tree, leaf, body);

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
      await db.insert(schema.message).values({ id: userMessageId, conversationId: conversation.id, parentId, role: "user", parts });
    }
    const assistantParentId = body.regenerate ? parentId : userMessageId;
    const activeTip = body.regenerate ? parentId : userMessageId;

    const [stored, project, settings, style] = await Promise.all([
      db.query.message
        .findMany({ where: eq(schema.message.conversationId, conversation.id), orderBy: asc(schema.message.createdAt) })
        .then((rows) => pathTo(rows, activeTip)),
      loadProject(user.id, conversation.projectId),
      getSettings(user.id),
      resolveStyle(user.id, body.style),
    ]);
    const memories = settings.memoryEnabled ? await listMemories(user.id) : null;
    const history = withProjectFiles(stored, project?.files ?? []);
    const attachmentIds = history.flatMap((m) =>
      m.parts.flatMap((p) => (p.type === "attachment" ? [p.attachmentId] : [])),
    );
    const [found, shared] = attachmentIds.length
      ? await Promise.all([
          db.select().from(schema.attachment).where(inArray(schema.attachment.id, attachmentIds)),
          sharedAttachmentIds(user.id, attachmentIds),
        ])
      : [[], new Set<string>()];
    const files = await Promise.all(
      found
        .filter((f) => f.userId === user.id || shared.has(f.id))
        .map(async (f) => ({ id: f.id, name: f.name, mediaType: f.mediaType, data: await readFile(f) })),
    );
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

        const titleJob =
          isNew && body.text.trim() ? generateTitle(model, key.apiKey, body.text, controller.signal) : Promise.resolve(null);
        const workspace = await activeWorkspace(auth);
        const toolbox = await openToolbox(user.id, workspace?.id ?? null);
        const builtins = builtinTools({
          userId: user.id,
          artifacts: settings.artifactsEnabled,
          memory: settings.memoryEnabled,
          code: settings.codeEnabled && codeExecutionEnabled(),
          files: [...attachments.values()],
          conversationId: conversation.id,
        });
        for (const error of toolbox.errors) send({ type: "notice", level: "warning", text: error });

        const outcome = await runTurn(
          {
            model,
            apiKey: key.apiKey,
            system: systemPrompt({
              user,
              preferences: settings.preferences,
              memories,
              project: project ? { name: project.name, instructions: project.instructions } : null,
              artifacts: settings.artifactsEnabled,
              style,
              research: researching,
            }),
            history,
            attachments,
            tools: [...builtins.specs, ...toolbox.tools],
            effort: researching ? "high" : body.effort,
            webSearch: body.webSearch || researching,
            research: researching,
          },
          (call, signal) => (builtins.handles(call.name) ? builtins.run(call) : toolbox.call(call.id, call.name, call.input, signal)),
          send,
          controller.signal,
        );
        await toolbox.close();

        if (outcome.parts.length) {
          await db.insert(schema.message).values({
            id: assistantMessageId,
            conversationId: conversation.id,
            parentId: assistantParentId,
            role: "assistant",
            parts: outcome.parts,
            model: model.id,
            native: outcome.native,
          });
        }
        await db
          .update(schema.conversation)
          .set({ updatedAt: new Date(), model: model.id, currentLeafId: outcome.parts.length ? assistantMessageId : activeTip })
          .where(eq(schema.conversation.id, conversation.id));
        if (outcome.usage.inputTokens || outcome.usage.outputTokens) {
          await recordUsage(user.id, model.id, outcome.usage, key.byok);
        }

        const aiTitle = await titleJob;
        if (aiTitle) {
          await db.update(schema.conversation).set({ title: aiTitle }).where(eq(schema.conversation.id, conversation.id));
          send({ type: "title", title: aiTitle });
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
