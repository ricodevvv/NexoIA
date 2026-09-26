import { NextResponse } from "next/server";
import { GITHUB_STATE_COOKIE, githubAppEnabled, isGithubAdmin, saveAppFromManifest, stateMatches } from "@/lib/github";
import { HttpError } from "@/lib/http";
import { logError } from "@/lib/log";
import { getUser } from "@/lib/session";

function back(request: Request, params: Record<string, string>) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("tab", "github");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url, 303);
  res.cookies.delete({ name: GITHUB_STATE_COOKIE, path: "/api/github" });
  return res;
}

/**
 * A donde vuelve GitHub después de crear la app. Comprueba el `state` y que
 * sea un administrador, y guarda las credenciales de la app.
 */
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  if (!isGithubAdmin(user.email)) return back(request, { github: "error", reason: "Solo un administrador puede crear la GitHub App" });
  if (!code || !stateMatches(request, params.get("state") ?? "", user.id)) {
    return back(request, { github: "error", reason: "La creación de la app venció o no es de esta sesión. Intenta de nuevo." });
  }
  if (await githubAppEnabled()) return back(request, { github: "error", reason: "La GitHub App ya estaba configurada" });
  try {
    const slug = await saveAppFromManifest(code);
    return back(request, { github: "app", slug });
  } catch (err) {
    logError("github", err, { user: user.id });
    return back(request, { github: "error", reason: err instanceof HttpError ? err.message : "No se pudo guardar la app" });
  }
}
