import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { connectWithCode, GITHUB_STATE_COOKIE } from "@/lib/github";
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

function sameState(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * A donde vuelve el usuario desde GitHub, tanto al autorizar como al instalar
 * la app. Comprueba el `state` contra la cookie y guarda los tokens si viene
 * un código; una instalación sin código solo regresa a ajustes.
 */
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const state = params.get("state") ?? "";
  const cookie = request.headers.get("cookie")?.match(new RegExp(`${GITHUB_STATE_COOKIE}=([^;]+)`))?.[1] ?? "";
  const [expected, owner] = decodeURIComponent(cookie).split(".");

  if (params.get("error")) return back(request, { github: "error", reason: params.get("error_description") ?? "Cancelaste la autorización" });
  if (!code) {
    if (params.get("setup_action")) return back(request, { github: "installed" });
    return back(request, { github: "error", reason: "GitHub no mandó el código" });
  }
  if (!expected || owner !== user.id || !sameState(state, expected)) {
    return back(request, { github: "error", reason: "La autorización venció o no es de esta sesión. Intenta de nuevo." });
  }
  try {
    const login = await connectWithCode(user.id, code);
    return back(request, { github: "ok", login });
  } catch (err) {
    logError("github", err, { user: user.id });
    return back(request, { github: "error", reason: err instanceof HttpError ? err.message : "No se pudo conectar la cuenta" });
  }
}
