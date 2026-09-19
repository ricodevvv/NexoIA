import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { apiUser, handleError, HttpError } from "@/lib/session";

const Patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(300).optional(),
  instructions: z.string().max(20_000).optional(),
});

function owned(userId: string, id: string) {
  return and(eq(schema.project.id, id), eq(schema.project.userId, userId));
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    const data = Patch.parse(await request.json());
    const [row] = await db
      .update(schema.project)
      .set({ ...data, updatedAt: new Date() })
      .where(owned(user.id, id))
      .returning({ id: schema.project.id });
    if (!row) throw new HttpError(404, "Proyecto no encontrado");
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
    await db.delete(schema.project).where(owned(user.id, id));
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
