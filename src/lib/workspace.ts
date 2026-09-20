import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export type Role = "owner" | "admin" | "member";

export type Workspace = { id: string; name: string; slug: string; role: Role };

export function canManage(role: Role | null | undefined) {
  return role === "owner" || role === "admin";
}

export async function listWorkspaces(userId: string): Promise<Workspace[]> {
  const rows = await db
    .select({ id: schema.organization.id, name: schema.organization.name, slug: schema.organization.slug, role: schema.member.role })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(eq(schema.member.userId, userId))
    .orderBy(asc(schema.organization.name));
  return rows.map((r) => ({ ...r, role: r.role as Role }));
}

export async function membership(userId: string, organizationId: string): Promise<Workspace | null> {
  const [row] = await db
    .select({ id: schema.organization.id, name: schema.organization.name, slug: schema.organization.slug, role: schema.member.role })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(and(eq(schema.member.userId, userId), eq(schema.member.organizationId, organizationId)))
    .limit(1);
  return row ? { ...row, role: row.role as Role } : null;
}

/**
 * El workspace activo de la sesión, solo si el usuario sigue siendo miembro.
 * Null significa el espacio personal.
 */
export async function activeWorkspace(data: { user: { id: string }; session: { activeOrganizationId?: string | null } }) {
  const id = data.session.activeOrganizationId;
  return id ? membership(data.user.id, id) : null;
}
