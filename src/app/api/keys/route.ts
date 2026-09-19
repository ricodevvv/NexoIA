import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { encrypt } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import { apiUser, handleError } from "@/lib/session";

const Provider = z.enum(["anthropic", "openai"]);
const Put = z.object({ provider: Provider, key: z.string().trim().min(10).max(500) });

export async function GET() {
  try {
    const user = await apiUser();
    const rows = await db
      .select({ provider: schema.apiKey.provider, hint: schema.apiKey.hint, createdAt: schema.apiKey.createdAt })
      .from(schema.apiKey)
      .where(eq(schema.apiKey.userId, user.id));
    return Response.json(rows);
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await apiUser();
    const { provider, key } = Put.parse(await request.json());
    await db.delete(schema.apiKey).where(and(eq(schema.apiKey.userId, user.id), eq(schema.apiKey.provider, provider)));
    await db.insert(schema.apiKey).values({
      id: nanoid(),
      userId: user.id,
      provider,
      secret: encrypt(key),
      hint: `…${key.slice(-4)}`,
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Key inválida" }, { status: 400 });
    return handleError(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await apiUser();
    const provider = Provider.parse(new URL(request.url).searchParams.get("provider"));
    await db.delete(schema.apiKey).where(and(eq(schema.apiKey.userId, user.id), eq(schema.apiKey.provider, provider)));
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
