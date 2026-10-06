import type { Metadata } from "next";
import { PromptLibrary } from "@/components/platform/prompt-library";
import { modelOptions } from "@/lib/ai/options";
import { listPrompts } from "@/lib/platform/prompts";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Prompts" };

export default async function PromptsPage() {
  const user = await requireUser();
  const [prompts, models] = await Promise.all([listPrompts(user.id), modelOptions(user.id)]);
  return <PromptLibrary prompts={prompts} models={models.filter((m) => m.available).map((m) => ({ id: m.id, label: m.label }))} />;
}
