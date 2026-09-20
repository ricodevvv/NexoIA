import type { Metadata } from "next";
import { connection } from "next/server";
import { enabledSocialProviders } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function SignupPage(props: PageProps<"/signup">) {
  const { next } = await props.searchParams;
  await connection();
  return <AuthForm mode="signup" providers={enabledSocialProviders()} next={safeNext(next)} />;
}
