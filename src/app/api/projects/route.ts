import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { apiUser, handleError } from "@/lib/session";

const Create = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(""),
});

export async function GET() {
  try {
    const user = await apiUser();
    const rows = await db
      .select({
        id: schema.project.id,
        name: schema.project.name,
        description: schema.project.description,
        updatedAt: schema.project.updatedAt,
      })
      .from(schema.project)
      .where(eq(schema.project.userId, user.id))
      .orderBy(desc(schema.project.updatedAt));
    return Response.json(rows);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await apiUser();
    const data = Create.parse(await request.json());
    const [row] = await db
      .insert(schema.project)
      .values({ id: nanoid(), userId: user.id, ...data })
      .returning({ id: schema.project.id });
    return Response.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Datos inválidos" }, { status: 400 });
    return handleError(err);
  }
}
