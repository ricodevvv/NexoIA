import { NextResponse } from "next/server";
import { authorizeUrl, GITHUB_STATE_COOKIE, githubAppEnabled, installUrl, newState } from "@/lib/github";
import { getUser } from "@/lib/session";

/**
 * Manda al usuario a GitHub: `?to=install` abre la instalación de la app para
 * elegir cuenta, organizaciones y repos; si no, autoriza la cuenta. El
 * `state` queda en una cookie para comprobarlo al volver.
 */
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);
  if (!(await githubAppEnabled())) return NextResponse.redirect(new URL("/settings?tab=github&github=error&reason=La%20integraci%C3%B3n%20no%20est%C3%A1%20configurada", request.url), 303);
  const { state, cookie } = newState(user.id);
  const to = new URL(request.url).searchParams.get("to") === "install" ? await installUrl(state) : await authorizeUrl(state);
  const res = NextResponse.redirect(to, 303);
  res.cookies.set(GITHUB_STATE_COOKIE, cookie, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/api/github",
    maxAge: 600,
  });
  return res;
}
