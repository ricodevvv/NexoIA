import { count, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { encrypt } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import { CodeServerInput, listCodeServers, normalizeServerUrl, publicServer } from "@/lib/nexocode";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { assertSafeUrl } from "@/lib/safe-url";
import { apiUser, handleError, HttpError } from "@/lib/session";

const MAX_SERVERS = 10;

export async function GET() {
  try {
    const user = await apiUser();
    return Response.json((await listCodeServers(user)).map(publicServer));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await apiUser();
    await enforce([{ key: `code:servers:u:${user.id}`, ...LIMITS.connector }]);
    const input = CodeServerInput.parse(await request.json());
    const url = normalizeServerUrl(input.url);
    try {
      await assertSafeUrl(url);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const [row] = await db.select({ n: count() }).from(schema.codeServer).where(eq(schema.codeServer.userId, user.id));
    if ((row?.n ?? 0) >= MAX_SERVERS) throw new HttpError(400, `Puedes tener hasta ${MAX_SERVERS} servidores`);
    const [created] = await db
      .insert(schema.codeServer)
      .values({
        id: nanoid(12),
        userId: user.id,
        name: input.name,
        url,
        username: input.username,
        password: input.password ? encrypt(input.password) : null,
        directory: input.directory || null,
      })
      .returning({ id: schema.codeServer.id });
    return Response.json(created);
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Revisa el nombre y la URL del servidor" }, { status: 400 });
    return handleError(err);
  }
}
