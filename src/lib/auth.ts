import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/lib/db";
import { sendMail } from "@/lib/email";

function social() {
  const providers: Record<string, { clientId: string; clientSecret: string }> = {};
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.google = { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET };
  }
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.github = { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET };
  }
  return providers;
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === "1",
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Restablece tu contraseña de Nexo",
        title: "Restablece tu contraseña",
        body: `Hola ${user.name}, alguien pidió cambiar la contraseña de tu cuenta. Si fuiste tú, usa el botón para elegir una nueva.`,
        action: { label: "Elegir nueva contraseña", url },
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Confirma tu correo en Nexo",
        title: "Confirma tu correo",
        body: `Hola ${user.name}, confirma que este correo es tuyo para asegurar tu cuenta y poder recuperarla si olvidas la contraseña.`,
        action: { label: "Confirmar correo", url },
      });
    },
  },
  socialProviders: social(),
  user: { deleteUser: { enabled: true } },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  plugins: [nextCookies()],
});

export function enabledSocialProviders() {
  return Object.keys(social()) as ("google" | "github")[];
}
