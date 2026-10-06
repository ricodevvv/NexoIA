import { modelOptions } from "@/lib/ai/options";
import { authenticateKey } from "@/lib/platform/keys";
import { errorBody } from "@/lib/platform/openai-format";
import { HttpError } from "@/lib/http";
import { logError } from "@/lib/log";

/**
 * Lista de modelos que la key puede usar, con la forma de `GET /v1/models`.
 */
export async function GET(request: Request) {
  try {
    const { user } = await authenticateKey(request.headers);
    const models = (await modelOptions(user.id)).filter((m) => m.available);
    return Response.json({
      object: "list",
      data: models.map((m) => ({
        id: m.id,
        object: "model",
        created: 0,
        owned_by: m.group ?? m.provider,
        name: m.label,
      })),
    });
  } catch (err) {
    if (err instanceof HttpError) return Response.json(errorBody(err.status, err.message), { status: err.status });
    logError("api.models", err);
    return Response.json(errorBody(500, "Error interno"), { status: 500 });
  }
}
