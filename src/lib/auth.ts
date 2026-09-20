import { and, eq, isNotNull } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { db, schema } from "@/lib/db";
import { sendMail } from "@/lib/email";
import { syncSeats } from "@/lib/billing/team";
import { consume } from "@/lib/rate-limit";
import { deleteFiles } from "@/lib/storage";

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
      organization: schema.organization,
      member: schema.member,
      invitation: schema.invitation,
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
  user: {
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        const rows = await db
          .select({ key: schema.attachment.storageKey })
          .from(schema.attachment)
          .where(and(eq(schema.attachment.userId, user.id), isNotNull(schema.attachment.storageKey)));
        await deleteFiles(rows.map((r) => r.key!));
      },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customStorage: { consume: (key, rule) => consume(`auth:${key}`, rule) },
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 3600, max: 10 },
      "/request-password-reset": { window: 3600, max: 5 },
      "/send-verification-email": { window: 3600, max: 5 },
    },
  },
  plugins: [
    organization({
      creatorRole: "owner",
      membershipLimit: 200,
      invitationExpiresIn: 60 * 60 * 24 * 7,
      cancelPendingInvitationsOnReInvite: true,
      sendInvitationEmail: async ({ id, email, organization: org, inviter }) => {
        const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
        await sendMail({
          to: email,
          subject: `${inviter.user.name} te invitó a ${org.name} en Nexo`,
          title: `Únete a ${org.name}`,
          body: `${inviter.user.name} te invitó a su equipo en Nexo. Vas a compartir proyectos y conectores con el resto del equipo; tus chats siguen siendo privados.`,
          action: { label: "Ver invitación", url: `${base}/invite/${id}` },
        });
      },
      organizationHooks: {
        afterAddMember: async ({ organization: org }) => syncSeats(org.id),
        afterRemoveMember: async ({ organization: org }) => syncSeats(org.id),
        afterAcceptInvitation: async ({ organization: org }) => syncSeats(org.id),
      },
    }),
    nextCookies(),
  ],
});

export function enabledSocialProviders() {
  return Object.keys(social()) as ("google" | "github")[];
}
