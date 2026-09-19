import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { apiUser, handleError, HttpError } from "@/lib/session";

const MAX_FILES = 30;

async function ownedProject(userId: string, id: string) {
  const project = await db.query.project.findFirst({
    where: and(eq(schema.project.id, id), eq(schema.project.userId, userId)),
  });
  if (!project) throw new HttpError(404, "Proyecto no encontrado");
  return project;
}

export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/files">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    await ownedProject(user.id, id);
    const { attachmentId } = z.object({ attachmentId: z.string() }).parse(await request.json());
    const file = await db.query.attachment.findFirst({
      where: and(eq(schema.attachment.id, attachmentId), eq(schema.attachment.userId, user.id)),
    });
    if (!file) throw new HttpError(404, "Archivo no encontrado");
    const [row] = await db.select({ n: count() }).from(schema.projectFile).where(eq(schema.projectFile.projectId, id));
    if ((row?.n ?? 0) >= MAX_FILES) throw new HttpError(400, `Un proyecto admite hasta ${MAX_FILES} archivos`);
    await db.insert(schema.projectFile).values({ projectId: id, attachmentId }).onConflictDoNothing();
    await db.update(schema.project).set({ updatedAt: new Date() }).where(eq(schema.project.id, id));
    return Response.json({ id: file.id, name: file.name, mediaType: file.mediaType, size: file.size });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Datos inválidos" }, { status: 400 });
    return handleError(err);
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/projects/[id]/files">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    await ownedProject(user.id, id);
    const attachmentId = new URL(request.url).searchParams.get("attachmentId");
    if (!attachmentId) throw new HttpError(400, "Falta attachmentId");
    await db
      .delete(schema.projectFile)
      .where(and(eq(schema.projectFile.projectId, id), eq(schema.projectFile.attachmentId, attachmentId)));
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
