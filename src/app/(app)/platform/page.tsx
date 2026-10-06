import type { Metadata } from "next";
import { Overview } from "@/components/platform/overview";
import { listLogs, usageReport } from "@/lib/platform/analytics";
import { apiBaseUrl } from "@/lib/platform/config";
import { listKeys } from "@/lib/platform/keys";
import { modelLabeler } from "@/lib/platform/labels";
import { modelOptions } from "@/lib/ai/options";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Plataforma" };

export default async function PlatformPage() {
  const user = await requireUser();
  const [label, keys, models] = await Promise.all([modelLabeler(user.id), listKeys(user.id), modelOptions(user.id)]);
  const keyNames = new Map(keys.map((k) => [k.id, k.name]));
  const [report, recent] = await Promise.all([
    usageReport({ userId: user.id }, "30d", { model: label, key: (id) => (id ? (keyNames.get(id) ?? "Key borrada") : "Sin key") }),
    listLogs(user.id, { limit: 6 }),
  ]);
  const firstModel = models.find((m) => m.available)?.id ?? "claude-opus-5-5";

  return (
    <Overview
      userName={user.name.split(" ")[0]}
      report={report}
      recent={recent.map((r) => ({ ...r, modelLabel: label(r.model) }))}
      activeKeys={keys.filter((k) => !k.revokedAt).length}
      baseUrl={apiBaseUrl()}
      sampleModel={firstModel}
    />
  );
}
