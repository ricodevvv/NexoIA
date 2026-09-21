import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { decrypt } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import { detectModels } from "@/lib/endpoints";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { apiUser, handleError, HttpError } from "@/lib/session";

const Body = z.object({
  baseUrl: z.string().trim().url().optional(),
  apiKey: z.string().trim().max(500).optional(),
  id: z.string().optional(),
});

/**
 * Lista los modelos de un endpoint. Sirve con los datos del formulario (antes
 * de guardarlo) o con el id de uno ya guardado, usando su key cifrada.
 */
export async function POST(request: Request) {
  try {
    const user = await apiUser();
    await enforce([{ key: `mcp:u:${user.id}`, ...LIMITS.connector }]);
    const body = Body.parse(await request.json());
    let baseUrl = body.baseUrl;
    let apiKey = body.apiKey ?? null;
    if (body.id) {
      const row = await db.query.userEndpoint.findFirst({
        where: and(eq(schema.userEndpoint.id, body.id), eq(schema.userEndpoint.userId, user.id)),
      });
      if (!row) throw new HttpError(404, "Endpoint no encontrado");
      baseUrl = row.baseUrl;
      apiKey = apiKey ?? (row.apiKey ? decrypt(row.apiKey) : null);
    }
    if (!baseUrl) throw new HttpError(400, "Falta la URL");
    try {
      return Response.json({ models: await detectModels(baseUrl, apiKey) });
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
  } catch (err) {
    if (err instanceof z.ZodError) return Response.json({ error: "Datos inválidos" }, { status: 400 });
    return handleError(err);
  }
}
