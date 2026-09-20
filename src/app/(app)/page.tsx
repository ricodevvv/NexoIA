import { Chat } from "@/components/chat/chat";
import { ResetOnReturn } from "@/components/chat/reset-on-return";
import { DEFAULT_MODEL } from "@/lib/ai/models";
import { modelOptions } from "@/lib/ai/options";
import { getPlan } from "@/lib/billing/usage";
import { requireUser } from "@/lib/session";
import { listStyles } from "@/lib/styles-server";

export default async function NewChatPage() {
  const user = await requireUser();
  const [models, plan, styles] = await Promise.all([modelOptions(user.id), getPlan(user.id), listStyles(user.id)]);
  const firstAvailable = models.find((m) => m.available && (m.tier === "free" || plan === "pro" || m.byok));
  const initialModel = models.find((m) => m.id === DEFAULT_MODEL && m.available && (plan === "pro" || m.byok))
    ? DEFAULT_MODEL
    : (firstAvailable?.id ?? DEFAULT_MODEL);

  return (
    <ResetOnReturn path="/">
      <Chat initialMessages={[]} initialModel={initialModel} models={models} userName={user.name} plan={plan}
      styles={styles} />
    </ResetOnReturn>
  );
}
