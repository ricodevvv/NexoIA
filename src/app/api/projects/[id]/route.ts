import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { projectAccess } from "@/lib/projects";
import { apiUser, handleError, HttpError } from "@/lib/session";

const Patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(300).optional(),
  instructions: z.string().max(20_000).optional(),
});

async function editable(userId: string, id: string) {
  const access = await projectAccess(userId, id);
  if (!access) throw new HttpError(404, "Proyecto no encontrado");
  if (!access.canEdit) throw new HttpError(403, "Solo quien creó el proyecto o un admin del equipo puede cambiarlo");
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    const data = Patch.parse(await request.json());
    await editable(user.id, id);
    const [row] = await db
      .update(schema.project)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.project.id, id))
      .returning({ id: schema.project.id });
    return Response.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Datos inválidos" }, { status: 400 });
    return handleError(err);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    await editable(user.id, id);
    await db.delete(schema.project).where(eq(schema.project.id, id));
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
