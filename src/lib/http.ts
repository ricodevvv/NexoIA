import { logError } from "@/lib/log";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Convierte un error en respuesta JSON. Si trae `retryAfter` (un 429), agrega
 * el header Retry-After.
 */
export function handleError(err: unknown) {
  if (err instanceof HttpError) {
    const retryAfter = (err as { retryAfter?: number }).retryAfter;
    return Response.json(
      { error: err.message },
      { status: err.status, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined },
    );
  }
  logError("api", err);
  return Response.json({ error: "Error interno" }, { status: 500 });
}
