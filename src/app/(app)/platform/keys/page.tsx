import type { Metadata } from "next";
import { KeysView } from "@/components/platform/keys-view";
import { modelOptions } from "@/lib/ai/options";
import { apiBaseUrl } from "@/lib/platform/config";
import { listKeys } from "@/lib/platform/keys";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "API keys" };

export default async function KeysPage() {
  const user = await requireUser();
  const [keys, models] = await Promise.all([listKeys(user.id), modelOptions(user.id)]);
  return <KeysView keys={keys} baseUrl={apiBaseUrl()} sampleModel={models.find((m) => m.available)?.id ?? "claude-opus-5-5"} />;
}
