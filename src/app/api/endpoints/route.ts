import { count, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { listEndpoints } from "@/lib/ai/user-models";
import { encrypt } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { EndpointInput, normalizeBase } from "@/lib/endpoints";
import { assertSafeUrl } from "@/lib/safe-url";
import { apiUser, handleError, HttpError } from "@/lib/session";

const MAX_ENDPOINTS = 10;

export async function GET() {
  try {
    const user = await apiUser();
    const rows = await listEndpoints(user.id);
    return Response.json(rows.map((r) => ({ id: r.id, name: r.name, baseUrl: r.baseUrl, models: r.models, hasKey: Boolean(r.apiKey) })));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await apiUser();
    await enforce([{ key: `mcp:u:${user.id}`, ...LIMITS.connector }]);
    const input = EndpointInput.parse(await request.json());
    const baseUrl = normalizeBase(input.baseUrl);
    try {
      await assertSafeUrl(baseUrl);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const [row] = await db.select({ n: count() }).from(schema.userEndpoint).where(eq(schema.userEndpoint.userId, user.id));
    if ((row?.n ?? 0) >= MAX_ENDPOINTS) throw new HttpError(400, `Puedes tener hasta ${MAX_ENDPOINTS} endpoints`);
    const [created] = await db
      .insert(schema.userEndpoint)
      .values({
        id: nanoid(12),
        userId: user.id,
        name: input.name,
        baseUrl,
        apiKey: input.apiKey ? encrypt(input.apiKey) : null,
        models: [...new Set(input.models)],
      })
      .returning({ id: schema.userEndpoint.id });
    return Response.json(created);
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Revisa el nombre, la URL y los modelos" }, { status: 400 });
    return handleError(err);
  }
}
