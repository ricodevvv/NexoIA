import { NextResponse } from "next/server";
import { appManifest, GITHUB_STATE_COOKIE, githubAppEnabled, isGithubAdmin, newState } from "@/lib/github";
import { getUser } from "@/lib/session";

function escape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Empieza a crear la GitHub App con el flujo de manifest: devuelve una página
 * que manda el manifest a GitHub, donde solo hay que confirmar. Con `?org=`
 * la app se crea en esa organización en vez de la cuenta personal.
 */
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/settings?tab=github&github=error&reason=${encodeURIComponent(reason)}`, request.url), 303);
  if (!isGithubAdmin(user.email)) return fail("Solo un administrador puede crear la GitHub App");
  if (await githubAppEnabled()) return fail("La GitHub App ya está configurada");

  const org = new URL(request.url).searchParams.get("org")?.trim() ?? "";
  if (org && !/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(org)) return fail("Ese nombre de organización no es válido");
  const { state, cookie } = newState(user.id);
  const action = `https://github.com/${org ? `organizations/${org}/` : ""}settings/apps/new?state=${state}`;
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Creando la GitHub App…</title></head>
<body style="font-family:system-ui;padding:2rem">
<form id="f" method="post" action="${escape(action)}">
<input type="hidden" name="manifest" value="${escape(JSON.stringify(appManifest()))}">
<p>Te estamos llevando a GitHub para crear la app…</p>
<button type="submit">Continuar a GitHub</button>
</form>
<script>document.getElementById("f").submit()</script>
</body></html>`;
  const res = new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  res.cookies.set(GITHUB_STATE_COOKIE, cookie, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/api/github",
    maxAge: 900,
  });
  return res;
}
