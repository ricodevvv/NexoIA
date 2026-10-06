import type { Metadata } from "next";
import { Playground } from "@/components/platform/playground";
import { DEFAULT_MODEL } from "@/lib/ai/models";
import { modelOptions } from "@/lib/ai/options";
import { getPlan } from "@/lib/billing/usage";
import { apiBaseUrl } from "@/lib/platform/config";
import { listPrompts } from "@/lib/platform/prompts";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Playground" };

export default async function PlaygroundPage(props: PageProps<"/platform/playground">) {
  const user = await requireUser();
  const { prompt } = await props.searchParams;
  const [models, prompts, plan] = await Promise.all([modelOptions(user.id), listPrompts(user.id), getPlan(user.id)]);
  const usable = models.filter((m) => m.available && (m.tier === "free" || plan === "pro" || m.byok));
  const initialPrompt = typeof prompt === "string" ? (prompts.find((p) => p.id === prompt) ?? null) : null;
  const initialModel =
    (initialPrompt?.model && usable.some((m) => m.id === initialPrompt.model) ? initialPrompt.model : null) ??
    (usable.some((m) => m.id === DEFAULT_MODEL) ? DEFAULT_MODEL : (usable[0]?.id ?? ""));
  return <Playground models={usable} prompts={prompts} initialPrompt={initialPrompt} initialModel={initialModel} baseUrl={apiBaseUrl()} />;
}
