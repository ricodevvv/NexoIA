import { and, asc, count, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { apiUser, handleError, HttpError } from "@/lib/session";

const Create = z.object({
  name: z.string().trim().min(1).max(40),
  instructions: z.string().trim().min(10).max(4000),
});

const MAX_STYLES = 20;

export async function GET() {
  try {
    const user = await apiUser();
    const rows = await db
      .select({ id: schema.responseStyle.id, name: schema.responseStyle.name, instructions: schema.responseStyle.instructions })
      .from(schema.responseStyle)
      .where(eq(schema.responseStyle.userId, user.id))
      .orderBy(asc(schema.responseStyle.createdAt));
    return Response.json(rows);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await apiUser();
    const data = Create.parse(await request.json());
    const [row] = await db.select({ n: count() }).from(schema.responseStyle).where(eq(schema.responseStyle.userId, user.id));
    if ((row?.n ?? 0) >= MAX_STYLES) throw new HttpError(400, `Puedes tener hasta ${MAX_STYLES} estilos`);
    const [created] = await db
      .insert(schema.responseStyle)
      .values({ id: `s_${nanoid(10)}`, userId: user.id, ...data })
      .returning({ id: schema.responseStyle.id });
    return Response.json(created);
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Ponle nombre y unas instrucciones de al menos 10 caracteres" }, { status: 400 });
    return handleError(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await apiUser();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "Falta el id");
    await db.delete(schema.responseStyle).where(and(eq(schema.responseStyle.id, id), eq(schema.responseStyle.userId, user.id)));
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
