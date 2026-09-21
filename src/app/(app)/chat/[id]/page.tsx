import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Chat } from "@/components/chat/chat";
import { modelOptions } from "@/lib/ai/options";
import { conversationView } from "@/lib/conversation-view";
import { getPlan } from "@/lib/billing/usage";
import { db, schema } from "@/lib/db";
import { getUser, requireUser } from "@/lib/session";
import { listStyles } from "@/lib/styles-server";

async function findConversation(userId: string, id: string) {
  return db.query.conversation.findFirst({
    where: and(eq(schema.conversation.id, id), eq(schema.conversation.userId, userId)),
  });
}

export async function generateMetadata(props: PageProps<"/chat/[id]">): Promise<Metadata> {
  const user = await getUser();
  const { id } = await props.params;
  const conv = user ? await findConversation(user.id, id) : null;
  return { title: conv?.title ?? "Chat" };
}

export default async function ChatPage(props: PageProps<"/chat/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const conversation = await findConversation(user.id, id);
  if (!conversation) notFound();

  const [rows, models, plan, project, styles] = await Promise.all([
    conversationView(id, conversation.currentLeafId),
    modelOptions(user.id),
    getPlan(user.id),
    conversation.projectId
      ? db.query.project.findFirst({ where: eq(schema.project.id, conversation.projectId) })
      : Promise.resolve(undefined),
    listStyles(user.id),
  ]);

  return (
    <Chat
      key={id}
      conversationId={id}
      title={conversation.title}
      initialMessages={rows}
      initialModel={conversation.model}
      models={models}
      userName={user.name}
      plan={plan}
      styles={styles}
      project={project ? { id: project.id, name: project.name } : null}
    />
  );
}
