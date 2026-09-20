import { Shell } from "@/components/shell";
import { getPlan } from "@/lib/billing/usage";
import { requireSession } from "@/lib/session";
import { activeWorkspace, listWorkspaces } from "@/lib/workspace";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireSession();
  const { user } = auth;
  const [plan, workspaces, active] = await Promise.all([getPlan(user.id), listWorkspaces(user.id), activeWorkspace(auth)]);
  return (
    <Shell
      user={{ name: user.name, email: user.email, image: user.image ?? null }}
      plan={plan}
      workspaces={workspaces.map((w) => ({ id: w.id, name: w.name, role: w.role }))}
      activeWorkspace={active?.id ?? null}
    >
      {children}
    </Shell>
  );
}
