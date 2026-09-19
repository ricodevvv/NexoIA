import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { Settings } from "@/components/settings/settings";
import { PLANS } from "@/lib/billing/plans";
import { stripeEnabled } from "@/lib/billing/stripe";
import { getPlan, usedToday } from "@/lib/billing/usage";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getSettings, listMemories } from "@/lib/settings";

export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage(props: PageProps<"/settings">) {
  const user = await requireUser();
  const { tab, checkout } = await props.searchParams;

  const [keys, servers, plan, used, sub, settings, memories, shares] = await Promise.all([
    db
      .select({ provider: schema.apiKey.provider, hint: schema.apiKey.hint })
      .from(schema.apiKey)
      .where(eq(schema.apiKey.userId, user.id)),
    db
      .select({ id: schema.mcpServer.id, name: schema.mcpServer.name, url: schema.mcpServer.url, enabled: schema.mcpServer.enabled })
      .from(schema.mcpServer)
      .where(eq(schema.mcpServer.userId, user.id))
      .orderBy(desc(schema.mcpServer.createdAt)),
    getPlan(user.id),
    usedToday(user.id),
    db.query.subscription.findFirst({ where: eq(schema.subscription.userId, user.id) }),
    getSettings(user.id),
    listMemories(user.id),
    db
      .select({ id: schema.share.id, conversationId: schema.share.conversationId, title: schema.share.title, createdAt: schema.share.createdAt })
      .from(schema.share)
      .where(eq(schema.share.userId, user.id))
      .orderBy(desc(schema.share.createdAt)),
  ]);

  return (
    <Settings
      initialTab={typeof tab === "string" ? tab : "account"}
      checkoutOk={checkout === "ok"}
      user={{ name: user.name, email: user.email }}
      keys={keys}
      personalization={{
        settings,
        memories: memories.map((m) => ({ id: m.id, content: m.content, createdAt: m.createdAt.toISOString() })),
        shares: shares.map((x) => ({ ...x, createdAt: x.createdAt.toISOString() })),
      }}
      servers={servers}
      serverKeys={{
        anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
        openai: Boolean(process.env.OPENAI_API_KEY),
      }}
      billing={{
        plan,
        used,
        limit: PLANS[plan].dailyMessages,
        plans: Object.values(PLANS),
        stripe: stripeEnabled(),
        renewsAt: sub?.currentPeriodEnd?.toISOString() ?? null,
        status: sub?.status ?? null,
      }}
    />
  );
}
