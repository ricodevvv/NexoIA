import type { Metadata } from "next";
import { ResetForm } from "../recovery-forms";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default async function ResetPasswordPage(props: PageProps<"/reset-password">) {
  const { token, error } = await props.searchParams;
  return <ResetForm token={typeof token === "string" ? token : null} invalid={Boolean(error)} />;
}
