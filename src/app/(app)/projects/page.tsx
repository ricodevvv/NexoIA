import { and, count, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { ProjectList } from "@/components/projects/project-list";
import { db, schema } from "@/lib/db";
import { visibleProjectsFilter } from "@/lib/projects";
import { requireSession } from "@/lib/session";
import { activeWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Proyectos" };

export default async function ProjectsPage() {
  const auth = await requireSession();
  const { user } = auth;
  const [rows, workspace] = await Promise.all([
    db
      .select({
        id: schema.project.id,
        name: schema.project.name,
        description: schema.project.description,
        updatedAt: schema.project.updatedAt,
        team: schema.organization.name,
        chats: count(schema.conversation.id),
      })
      .from(schema.project)
      .leftJoin(schema.organization, eq(schema.organization.id, schema.project.organizationId))
      .leftJoin(
        schema.conversation,
        and(eq(schema.conversation.projectId, schema.project.id), eq(schema.conversation.userId, user.id)),
      )
      .where(await visibleProjectsFilter(user.id))
      .groupBy(schema.project.id, schema.organization.name)
      .orderBy(desc(schema.project.updatedAt)),
    activeWorkspace(auth),
  ]);

  return (
    <ProjectList
      projects={rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }))}
      workspace={workspace ? { id: workspace.id, name: workspace.name } : null}
    />
  );
}
