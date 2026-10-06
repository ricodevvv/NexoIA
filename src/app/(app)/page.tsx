import { Chat } from "@/components/chat/chat";
import { ResetOnReturn } from "@/components/chat/reset-on-return";
import { DEFAULT_MODEL } from "@/lib/ai/models";
import { modelOptions } from "@/lib/ai/options";
import { getPlan } from "@/lib/billing/usage";
import { requireUser } from "@/lib/session";
import { listStyles } from "@/lib/styles-server";
import { countPromptUse, listPrompts } from "@/lib/platform/prompts";

export default async function NewChatPage(props: PageProps<"/">) {
  const user = await requireUser();
  const { prompt } = await props.searchParams;
  const [models, plan, styles, prompts] = await Promise.all([
    modelOptions(user.id),
    getPlan(user.id),
    listStyles(user.id),
    typeof prompt === "string" ? listPrompts(user.id) : Promise.resolve([]),
  ]);
  const picked = prompts.find((p) => p.id === prompt);
  if (picked) await countPromptUse(user.id, picked.id);
  const draft = picked?.content;
  const firstAvailable = models.find((m) => m.available && (m.tier === "free" || plan === "pro" || m.byok));
  const initialModel = models.find((m) => m.id === DEFAULT_MODEL && m.available && (plan === "pro" || m.byok))
    ? DEFAULT_MODEL
    : (firstAvailable?.id ?? DEFAULT_MODEL);

  return (
    <ResetOnReturn path="/">
      <Chat
        initialMessages={[]}
        initialModel={initialModel}
        models={models}
        userName={user.name}
        plan={plan}
        styles={styles}
        initialDraft={draft}
      />
    </ResetOnReturn>
  );
}
