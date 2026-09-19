import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/signup"];

export function proxy(request: NextRequest) {
  const hasSession = Boolean(getSessionCookie(request));
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/share/")) return NextResponse.next();
  const isPublic = PUBLIC.includes(pathname);
  if (!hasSession && !isPublic) return NextResponse.redirect(new URL("/login", request.url));
  if (hasSession && isPublic) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
