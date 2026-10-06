import type { Metadata } from "next";
import { LogsView } from "@/components/platform/logs-view";
import { listLogs, usedModels, type Source } from "@/lib/platform/analytics";
import { listKeys } from "@/lib/platform/keys";
import { modelLabeler } from "@/lib/platform/labels";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Logs" };

const SOURCES = new Set(["chat", "api", "playground", "code"]);

export default async function LogsPage(props: PageProps<"/platform/logs">) {
  const user = await requireUser();
  const params = await props.searchParams;
  const source = typeof params.source === "string" && SOURCES.has(params.source) ? (params.source as Source) : undefined;
  const status = params.status === "ok" || params.status === "error" ? params.status : undefined;
  const model = typeof params.model === "string" && params.model ? params.model : undefined;
  const [rows, models, label, keys] = await Promise.all([
    listLogs(user.id, { source, status, model, limit: 50 }),
    usedModels(user.id),
    modelLabeler(user.id),
    listKeys(user.id),
  ]);
  return (
    <LogsView
      initial={rows}
      filters={{ source: source ?? "", status: status ?? "", model: model ?? "" }}
      models={models.map((id) => ({ id, label: label(id) }))}
      labels={Object.fromEntries(models.map((id) => [id, label(id)]))}
      keys={Object.fromEntries(keys.map((k) => [k.id, `${k.name} (${k.prefix})`]))}
    />
  );
}
