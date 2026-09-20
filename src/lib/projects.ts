import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { canManage, listWorkspaces } from "@/lib/workspace";

type ProjectRow = typeof schema.project.$inferSelect;

export type ProjectAccess = { project: ProjectRow; canEdit: boolean; shared: boolean };

/**
 * Dice si el usuario puede usar un proyecto y si puede editarlo. Los personales
 * son solo de su dueño; los de un equipo los ve cualquier miembro, pero solo
 * los edita quien los creó o un admin.
 */
export async function projectAccess(userId: string, projectId: string): Promise<ProjectAccess | null> {
  const project = await db.query.project.findFirst({ where: eq(schema.project.id, projectId) });
  if (!project) return null;
  if (!project.organizationId) {
    return project.userId === userId ? { project, canEdit: true, shared: false } : null;
  }
  const member = await db.query.member.findFirst({
    where: and(eq(schema.member.organizationId, project.organizationId), eq(schema.member.userId, userId)),
  });
  if (!member) return null;
  return { project, canEdit: project.userId === userId || canManage(member.role as "owner" | "admin" | "member"), shared: true };
}

/**
 * Proyectos visibles: los personales y los de todos los equipos del usuario.
 */
export async function visibleProjectsFilter(userId: string) {
  const orgIds = (await listWorkspaces(userId)).map((w) => w.id);
  const personal = and(eq(schema.project.userId, userId), isNull(schema.project.organizationId));
  return orgIds.length ? or(personal, inArray(schema.project.organizationId, orgIds)) : personal;
}

/**
 * Ids de adjuntos que el usuario puede leer por estar en proyectos a los que
 * tiene acceso, aunque los haya subido otro miembro.
 */
export async function sharedAttachmentIds(userId: string, ids: string[]) {
  if (!ids.length) return new Set<string>();
  const rows = await db
    .select({ attachmentId: schema.projectFile.attachmentId })
    .from(schema.projectFile)
    .innerJoin(schema.project, eq(schema.project.id, schema.projectFile.projectId))
    .where(and(inArray(schema.projectFile.attachmentId, ids), await visibleProjectsFilter(userId)));
  return new Set(rows.map((r) => r.attachmentId));
}
