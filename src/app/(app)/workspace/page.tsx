import { and, count, desc, eq, gte, sql, sum } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WorkspaceAdmin } from "@/components/workspace/workspace-admin";
import { TEAM_PLAN } from "@/lib/billing/plans";
import { getTeamSubscription, teamBillingEnabled } from "@/lib/billing/team";
import { db, schema } from "@/lib/db";
import { isConnected } from "@/lib/mcp-oauth";
import { requireSession } from "@/lib/session";
import { activeWorkspace, canManage } from "@/lib/workspace";

export const metadata: Metadata = { title: "Equipo" };

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000);
}

export default async function WorkspacePage(props: PageProps<"/workspace">) {
  const auth = await requireSession();
  const workspace = await activeWorkspace(auth);
  if (!workspace) redirect("/");
  const { tab, checkout } = await props.searchParams;
  const since = daysAgo(30);

  const [members, invitations, servers, usage, sub] = await Promise.all([
    db
      .select({
        id: schema.member.id,
        userId: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        role: schema.member.role,
        joinedAt: schema.member.createdAt,
      })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
      .where(eq(schema.member.organizationId, workspace.id))
      .orderBy(schema.member.createdAt),
    db
      .select({ id: schema.invitation.id, email: schema.invitation.email, role: schema.invitation.role, expiresAt: schema.invitation.expiresAt })
      .from(schema.invitation)
      .where(and(eq(schema.invitation.organizationId, workspace.id), eq(schema.invitation.status, "pending")))
      .orderBy(desc(schema.invitation.createdAt)),
    db
      .select({
        id: schema.mcpServer.id,
        name: schema.mcpServer.name,
        url: schema.mcpServer.url,
        enabled: schema.mcpServer.enabled,
        authType: schema.mcpServer.authType,
        oauth: schema.mcpServer.oauth,
      })
      .from(schema.mcpServer)
      .where(eq(schema.mcpServer.organizationId, workspace.id))
      .orderBy(desc(schema.mcpServer.createdAt)),
    db
      .select({
        userId: schema.usage.userId,
        messages: count(),
        tokens: sql<number>`coalesce(${sum(schema.usage.inputTokens)}, 0) + coalesce(${sum(schema.usage.outputTokens)}, 0)`.mapWith(Number),
      })
      .from(schema.usage)
      .innerJoin(schema.member, and(eq(schema.member.userId, schema.usage.userId), eq(schema.member.organizationId, workspace.id)))
      .where(gte(schema.usage.createdAt, since))
      .groupBy(schema.usage.userId),
    getTeamSubscription(workspace.id),
  ]);

  const usageByUser = new Map(usage.map((u) => [u.userId, u]));

  return (
    <WorkspaceAdmin
      initialTab={typeof tab === "string" ? tab : "members"}
      checkoutOk={checkout === "ok"}
      me={auth.user.id}
      workspace={{ id: workspace.id, name: workspace.name, role: workspace.role }}
      manage={canManage(workspace.role)}
      members={members.map((m) => ({
        ...m,
        role: m.role as "owner" | "admin" | "member",
        joinedAt: m.joinedAt.toISOString(),
        messages: usageByUser.get(m.userId)?.messages ?? 0,
        tokens: usageByUser.get(m.userId)?.tokens ?? 0,
      }))}
      invitations={invitations.map((i) => ({ ...i, role: i.role ?? "member", expiresAt: i.expiresAt.toISOString() }))}
      servers={servers.map(({ oauth, ...s }) => ({ ...s, connected: isConnected({ authType: s.authType, oauth }) }))}
      billing={{
        enabled: teamBillingEnabled(),
        status: sub?.status ?? null,
        seats: sub?.seats ?? 0,
        renewsAt: sub?.currentPeriodEnd?.toISOString() ?? null,
        plan: TEAM_PLAN,
      }}
    />
  );
}
