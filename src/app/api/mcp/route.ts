import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { encrypt } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import { assertSafeUrl } from "@/lib/mcp";
import { apiUser, handleError, HttpError } from "@/lib/session";

const McpInput = z.object({
  name: z.string().trim().min(1).max(40),
  url: z.string().trim().url(),
  headers: z.record(z.string(), z.string()).default({}),
});

export async function GET() {
  try {
    const user = await apiUser();
    const rows = await db
      .select({
        id: schema.mcpServer.id,
        name: schema.mcpServer.name,
        url: schema.mcpServer.url,
        enabled: schema.mcpServer.enabled,
        hasHeaders: schema.mcpServer.headers,
      })
      .from(schema.mcpServer)
      .where(eq(schema.mcpServer.userId, user.id))
      .orderBy(desc(schema.mcpServer.createdAt));
    return Response.json(rows.map((r) => ({ ...r, hasHeaders: Boolean(r.hasHeaders) })));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await apiUser();
    const input = McpInput.parse(await request.json());
    try {
      await assertSafeUrl(input.url);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const [row] = await db
      .insert(schema.mcpServer)
      .values({
        id: nanoid(),
        userId: user.id,
        name: input.name,
        url: input.url,
        headers: Object.keys(input.headers).length ? encrypt(JSON.stringify(input.headers)) : null,
      })
      .returning({ id: schema.mcpServer.id });
    return Response.json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Datos inválidos" }, { status: 400 });
    return handleError(err);
  }
}
