import type { Metadata } from "next";
import { UsageView } from "@/components/platform/usage-view";
import { parseRange, usageReport } from "@/lib/platform/analytics";
import { listKeys } from "@/lib/platform/keys";
import { modelLabeler } from "@/lib/platform/labels";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Uso y costos" };

export default async function UsagePage(props: PageProps<"/platform/usage">) {
  const user = await requireUser();
  const { range } = await props.searchParams;
  const [label, keys] = await Promise.all([modelLabeler(user.id), listKeys(user.id)]);
  const keyNames = new Map(keys.map((k) => [k.id, `${k.name} (${k.prefix})`]));
  const report = await usageReport({ userId: user.id }, parseRange(range), {
    model: label,
    key: (id) => (id ? (keyNames.get(id) ?? "Key borrada") : "Sin key"),
  });
  return <UsageView report={report} />;
}
