import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { encrypt } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import { apiUser, handleError, HttpError } from "@/lib/session";

const Patch = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  apiKey: z.string().trim().max(500).optional(),
  models: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
});

function owned(userId: string, id: string) {
  return and(eq(schema.userEndpoint.id, id), eq(schema.userEndpoint.userId, userId));
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/endpoints/[id]">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    const { apiKey, models, name } = Patch.parse(await request.json());
    const [row] = await db
      .update(schema.userEndpoint)
      .set({
        ...(name ? { name } : {}),
        ...(models ? { models: [...new Set(models)] } : {}),
        ...(apiKey ? { apiKey: encrypt(apiKey) } : {}),
      })
      .where(owned(user.id, id))
      .returning({ id: schema.userEndpoint.id });
    if (!row) throw new HttpError(404, "Endpoint no encontrado");
    return Response.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Datos inválidos" }, { status: 400 });
    return handleError(err);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/endpoints/[id]">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    await db.delete(schema.userEndpoint).where(owned(user.id, id));
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
