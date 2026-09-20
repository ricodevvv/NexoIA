import { and, asc, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Chat } from "@/components/chat/chat";
import { ResetOnReturn } from "@/components/chat/reset-on-return";
import { ProjectDetails } from "@/components/projects/project-details";
import { DEFAULT_MODEL } from "@/lib/ai/models";
import { modelOptions } from "@/lib/ai/options";
import { getPlan } from "@/lib/billing/usage";
import { db, schema } from "@/lib/db";
import { projectAccess } from "@/lib/projects";
import { getUser, requireUser } from "@/lib/session";
import { listStyles } from "@/lib/styles-server";

async function findProject(userId: string, id: string) {
  return (await projectAccess(userId, id))?.project ?? null;
}

export async function generateMetadata(props: PageProps<"/projects/[id]">): Promise<Metadata> {
  const user = await getUser();
  const { id } = await props.params;
  const project = user ? await findProject(user.id, id) : null;
  return { title: project?.name ?? "Proyecto" };
}

export default async function ProjectPage(props: PageProps<"/projects/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const access = await projectAccess(user.id, id);
  if (!access) notFound();
  const { project, canEdit, shared } = access;
  const team = project.organizationId
    ? await db.query.organization.findFirst({ where: eq(schema.organization.id, project.organizationId) })
    : null;

  const [files, chats, models, plan, styles] = await Promise.all([
    db
      .select({
        id: schema.attachment.id,
        name: schema.attachment.name,
        mediaType: schema.attachment.mediaType,
        size: schema.attachment.size,
      })
      .from(schema.projectFile)
      .innerJoin(schema.attachment, eq(schema.attachment.id, schema.projectFile.attachmentId))
      .where(eq(schema.projectFile.projectId, id))
      .orderBy(asc(schema.projectFile.createdAt)),
    db
      .select({ id: schema.conversation.id, title: schema.conversation.title, updatedAt: schema.conversation.updatedAt })
      .from(schema.conversation)
      .where(and(eq(schema.conversation.projectId, id), eq(schema.conversation.userId, user.id)))
      .orderBy(desc(schema.conversation.updatedAt)),
    modelOptions(user.id),
    getPlan(user.id),
    listStyles(user.id),
  ]);

  const usable = models.filter((m) => m.available && (m.tier === "free" || plan === "pro" || m.byok));
  const initialModel = usable.find((m) => m.id === DEFAULT_MODEL)?.id ?? usable[0]?.id ?? DEFAULT_MODEL;

  return (
    <ResetOnReturn path={`/projects/${id}`}>
    <Chat
      initialMessages={[]}
      initialModel={initialModel}
      models={models}
      userName={user.name}
      plan={plan}
      styles={styles}
      project={{ id, name: project.name, description: project.description }}
      emptyExtra={
        <ProjectDetails
          project={{ id, name: project.name, description: project.description, instructions: project.instructions }}
          canEdit={canEdit}
          team={shared ? (team?.name ?? "tu equipo") : null}
          files={files}
          chats={chats.map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() }))}
        />
      }
    />
    </ResetOnReturn>
  );
}
