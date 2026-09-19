import { getPlan } from "@/lib/billing/usage";
import { requireUser } from "@/lib/session";
import { Shell } from "@/components/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const plan = await getPlan(user.id);
  return (
    <Shell user={{ name: user.name, email: user.email, image: user.image ?? null }} plan={plan}>
      {children}
    </Shell>
  );
}
