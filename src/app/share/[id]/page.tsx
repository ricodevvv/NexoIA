import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedChat } from "@/components/chat/shared-chat";
import { listModels } from "@/lib/ai/models";
import { db, schema } from "@/lib/db";

async function findShare(id: string) {
  return db.query.share.findFirst({ where: eq(schema.share.id, id) });
}

export async function generateMetadata(props: PageProps<"/share/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const share = await findShare(id);
  return { title: share?.title ?? "Chat compartido", robots: { index: false } };
}

export default async function SharePage(props: PageProps<"/share/[id]">) {
  const { id } = await props.params;
  const share = await findShare(id);
  if (!share) notFound();
  const labels = Object.fromEntries(listModels().map((m) => [m.id, m.label]));

  return (
    <SharedChat
      shareId={id}
      title={share.title}
      createdAt={share.createdAt.toISOString()}
      messages={share.messages.map((m, i) => ({ id: String(i), role: m.role, parts: m.parts, model: m.model }))}
      labels={labels}
    />
  );
}
