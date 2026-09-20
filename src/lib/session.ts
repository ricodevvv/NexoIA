import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { HttpError } from "@/lib/http";

export { HttpError, handleError } from "@/lib/http";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession() {
  const data = await getSession();
  if (!data) redirect("/login");
  return data;
}

export async function getUser() {
  return (await getSession())?.user ?? null;
}

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Para route handlers: devuelve el usuario o lanza un 401.
 */
export async function apiUser() {
  const user = await getUser();
  if (!user) throw new HttpError(401, "No has iniciado sesión");
  return user;
}

/**
 * Como apiUser, pero también devuelve la sesión (para saber el workspace activo).
 */
export async function apiSession() {
  const data = await getSession();
  if (!data) throw new HttpError(401, "No has iniciado sesión");
  return data;
}
