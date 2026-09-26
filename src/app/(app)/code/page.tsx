import type { Metadata } from "next";
import { CodeWorkspace } from "@/components/code/code-workspace";
import { listCodeServers, publicServer } from "@/lib/nexocode";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Nexo Code" };

export default async function CodePage({ searchParams }: PageProps<"/code">) {
  const user = await requireUser();
  const params = await searchParams;
  const servers = (await listCodeServers(user)).map(publicServer);
  const pick = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  return <CodeWorkspace servers={servers} initialServer={pick(params.server)} initialSession={pick(params.session)} userName={user.name} />;
}
