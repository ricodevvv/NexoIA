import { enforce, LIMITS } from "@/lib/rate-limit";
import { searchConversations } from "@/lib/search";
import { apiUser, handleError } from "@/lib/session";

/**
 * Busca en los títulos y en el texto de todos los mensajes del usuario.
 */
export async function GET(request: Request) {
  try {
    const user = await apiUser();
    await enforce([{ key: `search:u:${user.id}`, ...LIMITS.search }]);
    const q = new URL(request.url).searchParams.get("q") ?? "";
    return Response.json(await searchConversations(user.id, q));
  } catch (err) {
    return handleError(err);
  }
}
