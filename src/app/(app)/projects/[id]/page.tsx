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
import { getUser, requireUser } from "@/lib/session";
import { listStyles } from "@/lib/styles-server";

async function findProject(userId: string, id: string) {
  return db.query.project.findFirst({ where: and(eq(schema.project.id, id), eq(schema.project.userId, userId)) });
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
  const project = await findProject(user.id, id);
  if (!project) notFound();

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
      .where(eq(schema.conversation.projectId, id))
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
          files={files}
          chats={chats.map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() }))}
        />
      }
    />
    </ResetOnReturn>
  );
}
