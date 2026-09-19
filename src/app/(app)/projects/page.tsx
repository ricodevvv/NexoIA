import { count, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { ProjectList } from "@/components/projects/project-list";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Proyectos" };

export default async function ProjectsPage() {
  const user = await requireUser();
  const rows = await db
    .select({
      id: schema.project.id,
      name: schema.project.name,
      description: schema.project.description,
      updatedAt: schema.project.updatedAt,
      chats: count(schema.conversation.id),
    })
    .from(schema.project)
    .leftJoin(schema.conversation, eq(schema.conversation.projectId, schema.project.id))
    .where(eq(schema.project.userId, user.id))
    .groupBy(schema.project.id)
    .orderBy(desc(schema.project.updatedAt));

  return <ProjectList projects={rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }))} />;
}
