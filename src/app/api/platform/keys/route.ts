import { z } from "zod";
import { audit } from "@/lib/audit";
import { createKey, listKeys } from "@/lib/platform/keys";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { apiUser, handleError } from "@/lib/session";

const Create = z.object({
  name: z.string().trim().min(1).max(60),
  expiresInDays: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]).nullable().default(null),
});

export async function GET() {
  try {
    const user = await apiUser();
    return Response.json(await listKeys(user.id));
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Crea una key de la API de Nexo. La respuesta trae la key completa; es la
 * única vez que se puede ver.
 */
export async function POST(request: Request) {
  try {
    const user = await apiUser();
    await enforce([{ key: `platform:keys:${user.id}`, ...LIMITS.platform }]);
    const { name, expiresInDays } = Create.parse(await request.json());
    const { key, row } = await createKey(user.id, name, expiresInDays);
    await audit({ userId: user.id, action: "platform_key.created", target: name, metadata: { prefix: row.prefix }, headers: request.headers });
    return Response.json({ id: row.id, key, prefix: row.prefix });
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Ponle un nombre de hasta 60 caracteres" }, { status: 400 });
    return handleError(err);
  }
}
