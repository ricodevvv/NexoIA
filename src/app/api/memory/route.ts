import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { listMemories } from "@/lib/settings";
import { apiUser, handleError, HttpError } from "@/lib/session";

export async function GET() {
  try {
    const user = await apiUser();
    return Response.json(await listMemories(user.id));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await apiUser();
    const { content } = z.object({ content: z.string().trim().min(3).max(500) }).parse(await request.json());
    const [row] = await db
      .insert(schema.memory)
      .values({ id: nanoid(10), userId: user.id, content })
      .returning({ id: schema.memory.id });
    return Response.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Entre 3 y 500 caracteres" }, { status: 400 });
    return handleError(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await apiUser();
    const id = new URL(request.url).searchParams.get("id");
    if (id === "all") {
      await db.delete(schema.memory).where(eq(schema.memory.userId, user.id));
    } else if (id) {
      await db.delete(schema.memory).where(and(eq(schema.memory.id, id), eq(schema.memory.userId, user.id)));
    } else {
      throw new HttpError(400, "Falta el id");
    }
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
