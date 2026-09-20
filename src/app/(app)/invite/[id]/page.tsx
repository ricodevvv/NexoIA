import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { InviteCard } from "@/components/workspace/invite-card";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Invitación" };

function isExpired(date: Date) {
  return date.getTime() < Date.now();
}

export default async function InvitePage(props: PageProps<"/invite/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const [row] = await db
    .select({
      id: schema.invitation.id,
      email: schema.invitation.email,
      status: schema.invitation.status,
      role: schema.invitation.role,
      expiresAt: schema.invitation.expiresAt,
      team: schema.organization.name,
      inviter: schema.user.name,
    })
    .from(schema.invitation)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.invitation.organizationId))
    .innerJoin(schema.user, eq(schema.user.id, schema.invitation.inviterId))
    .where(eq(schema.invitation.id, id))
    .limit(1);

  let state: "ok" | "missing" | "used" | "expired" | "wrong-account" = "ok";
  if (!row) state = "missing";
  else if (row.status !== "pending") state = "used";
  else if (isExpired(row.expiresAt)) state = "expired";
  else if (row.email.toLowerCase() !== user.email.toLowerCase()) state = "wrong-account";

  return (
    <InviteCard
      state={state}
      invitation={row ? { id: row.id, email: row.email, team: row.team, inviter: row.inviter, role: row.role ?? "member" } : null}
      currentEmail={user.email}
    />
  );
}
