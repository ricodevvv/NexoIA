import { and, eq, isNotNull } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { organization, twoFactor } from "better-auth/plugins";
import { audit } from "@/lib/audit";
import type { AuditAction } from "@/lib/audit-labels";
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

const AUDITED: Record<string, AuditAction> = {
  "/change-password": "auth.password_changed",
  "/two-factor/verify-totp": "auth.two_factor_enabled",
  "/two-factor/disable": "auth.two_factor_disabled",
  "/revoke-session": "auth.session_revoked",
  "/revoke-other-sessions": "auth.sessions_revoked",
  "/update-user": "account.updated",
  "/organization/invite-member": "member.invited",
  "/organization/remove-member": "member.removed",
  "/organization/update-member-role": "member.role_changed",
};

/**
 * Deja en la bitácora las acciones de cuenta y de equipo que pasan por Better
 * Auth, solo si salieron bien y había una sesión (así no cuenta el paso de 2FA
 * del login).
 */
const auditAfter = createAuthMiddleware(async (ctx) => {
  const action = ctx.path ? AUDITED[ctx.path] : undefined;
  if (!action || isAPIError(ctx.context.returned)) return;
  const session = ctx.context.session ?? (await getSessionFromCtx(ctx).catch(() => null));
  if (!session) return;
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : (session.session as { activeOrganizationId?: string | null }).activeOrganizationId;
  const target = [body.email, body.memberIdOrEmail, body.memberId].find((v): v is string => typeof v === "string") ?? null;
  await audit({
    userId: session.user.id,
    action,
    organizationId: action.startsWith("member.") ? organizationId : null,
    target,
    metadata: typeof body.role === "string" ? { role: body.role } : {},
    headers: ctx.headers ?? null,
  });
});

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
      twoFactor: schema.twoFactor,
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
  hooks: { after: auditAfter },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => audit({ userId: user.id, action: "auth.sign_up", target: user.email }),
      },
    },
    session: {
      create: {
        after: async (session) =>
          audit({ userId: session.userId, action: "auth.sign_in", ip: session.ipAddress ?? null, userAgent: session.userAgent ?? null }),
      },
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customStorage: { consume: (key, rule) => consume(`auth:${key}`, rule) },
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 3600, max: Number(process.env.SIGNUP_RATE_MAX ?? 10) },
      "/request-password-reset": { window: 3600, max: 5 },
      "/send-verification-email": { window: 3600, max: 5 },
    },
  },
  plugins: [
    twoFactor({ issuer: "Nexo", backupCodeOptions: { amount: 10, length: 10 } }),
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
