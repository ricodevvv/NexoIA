import type { Metadata } from "next";
import { ForgotForm } from "../recovery-forms";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function ForgotPasswordPage() {
  return <ForgotForm />;
}
