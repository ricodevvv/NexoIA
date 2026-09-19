import type { Metadata } from "next";
import { connection } from "next/server";
import { enabledSocialProviders } from "@/lib/auth";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function SignupPage() {
  await connection();
  return <AuthForm mode="signup" providers={enabledSocialProviders()} />;
}
