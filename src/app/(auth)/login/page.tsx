import type { Metadata } from "next";
import { connection } from "next/server";
import { enabledSocialProviders } from "@/lib/auth";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage() {
  await connection();
  return <AuthForm mode="login" providers={enabledSocialProviders()} />;
}
