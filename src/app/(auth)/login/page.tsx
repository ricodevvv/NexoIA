import type { Metadata } from "next";
import { connection } from "next/server";
import { enabledSocialProviders } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { next } = await props.searchParams;
  await connection();
  return <AuthForm mode="login" providers={enabledSocialProviders()} next={safeNext(next)} />;
}
