import type { Metadata } from "next";
import { ActivityLog } from "@/components/platform/activity-log";
import { listAudit } from "@/lib/audit";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Actividad" };

export default async function ActivityPage() {
  const user = await requireUser();
  const rows = await listAudit({ userId: user.id }, { limit: 50 });
  return (
    <div className="page">
      <div className="page-inner">
        <PageHeader
          eyebrow="Plataforma"
          title="Actividad"
          description="Registro de seguridad de tu cuenta: inicios de sesión, keys, conectores, datos compartidos y más, con fecha e IP."
        />
        <ActivityLog initial={rows} endpoint="/api/platform/activity" />
      </div>
    </div>
  );
}
