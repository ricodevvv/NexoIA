import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { apiUser, handleError } from "@/lib/session";
import { CLOUD_PREFIX, deleteEnvironment, EnvironmentInput, environmentValues, getEnvironment, publicEnvironment } from "@/lib/workspaces";

/**
 * Cambia un entorno. Las sesiones que ya tienen contenedor prendido siguen
 * con lo de antes hasta que su contenedor se vuelva a crear.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/code/environments/[id]">) {
  try {
    const user = await apiUser();
    const env = await getEnvironment(user.id, (await ctx.params).id);
    const values = environmentValues(EnvironmentInput.parse(await request.json()));
    const [row] = await db.update(schema.codeEnvironment).set(values).where(eq(schema.codeEnvironment.id, env.id)).returning();
    return Response.json({ ...publicEnvironment(row), serverId: `${CLOUD_PREFIX}${row.id}` });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Revisa los campos del entorno" }, { status: 400 });
    return handleError(err);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/code/environments/[id]">) {
  try {
    const user = await apiUser();
    await deleteEnvironment(user.id, (await ctx.params).id);
    return Response.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
