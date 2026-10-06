import { and, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WorkspaceAdmin } from "@/components/workspace/workspace-admin";
import { TEAM_PLAN } from "@/lib/billing/plans";
import { getTeamSubscription, teamBillingEnabled } from "@/lib/billing/team";
import { db, schema } from "@/lib/db";
import { listAudit } from "@/lib/audit";
import { isConnected } from "@/lib/mcp-oauth";
import { usageByUser, usageReport } from "@/lib/platform/analytics";
import { modelLabeler } from "@/lib/platform/labels";
import { requireSession } from "@/lib/session";
import { activeWorkspace, canManage } from "@/lib/workspace";

export const metadata: Metadata = { title: "Equipo" };

export default async function WorkspacePage(props: PageProps<"/workspace">) {
  const auth = await requireSession();
  const workspace = await activeWorkspace(auth);
  if (!workspace) redirect("/");
  const { tab, checkout } = await props.searchParams;

  const [members, invitations, servers, sub, label] = await Promise.all([
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
    getTeamSubscription(workspace.id),
    modelLabeler(auth.user.id),
  ]);

  const memberIds = members.map((m) => m.userId);
  const manage = canManage(workspace.role);
  const [perUser, report, activity] = await Promise.all([
    usageByUser(memberIds, 30),
    usageReport({ userIds: memberIds }, "30d", { model: label, key: () => "API" }),
    manage ? listAudit({ organizationId: workspace.id }, { limit: 50 }) : Promise.resolve([]),
  ]);

  return (
    <WorkspaceAdmin
      initialTab={typeof tab === "string" ? tab : "members"}
      checkoutOk={checkout === "ok"}
      me={auth.user.id}
      workspace={{ id: workspace.id, name: workspace.name, role: workspace.role }}
      manage={manage}
      report={report}
      activity={activity}
      members={members.map((m) => ({
        ...m,
        role: m.role as "owner" | "admin" | "member",
        joinedAt: m.joinedAt.toISOString(),
        messages: perUser.get(m.userId)?.requests ?? 0,
        tokens: (perUser.get(m.userId)?.inputTokens ?? 0) + (perUser.get(m.userId)?.outputTokens ?? 0),
        cost: perUser.get(m.userId)?.cost ?? 0,
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
