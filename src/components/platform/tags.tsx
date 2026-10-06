import { SOURCE_LABEL, type Source } from "@/lib/platform/analytics-labels";

const SOURCE_TONE: Record<Source, string> = { chat: "tag", api: "tag tag-accent", playground: "tag tag-info", code: "tag" };

export function SourceTag({ source }: { source: Source }) {
  return <span className={SOURCE_TONE[source]}>{SOURCE_LABEL[source]}</span>;
}

/**
 * Estado de una petición con punto y texto, para no depender solo del color.
 */
export function StatusTag({ status }: { status: "ok" | "error" }) {
  return status === "ok" ? (
    <span className="tag tag-success">
      <span className="dot" aria-hidden="true" /> Correcta
    </span>
  ) : (
    <span className="tag tag-danger">
      <span className="dot" aria-hidden="true" /> Error
    </span>
  );
}
