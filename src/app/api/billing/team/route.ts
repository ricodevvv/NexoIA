import { stripe } from "@/lib/billing/stripe";
import { getTeamSubscription, memberCount, teamBillingEnabled } from "@/lib/billing/team";
import { db, schema } from "@/lib/db";
import { apiSession, handleError, HttpError } from "@/lib/session";
import { activeWorkspace, canManage } from "@/lib/workspace";

async function teamCustomer(organizationId: string, name: string, email: string) {
  const sub = await getTeamSubscription(organizationId);
  if (sub?.stripeCustomerId) return sub.stripeCustomerId;
  const customer = await stripe().customers.create({ name, email, metadata: { organizationId } });
  await db
    .insert(schema.orgSubscription)
    .values({ organizationId, stripeCustomerId: customer.id })
    .onConflictDoUpdate({ target: schema.orgSubscription.organizationId, set: { stripeCustomerId: customer.id } });
  return customer.id;
}

/**
 * Abre el checkout del plan Team (con tantos asientos como miembros) o, si ya
 * hay suscripción, el portal de Stripe del equipo. Solo para admins.
 */
export async function POST(request: Request) {
  try {
    const auth = await apiSession();
    if (!teamBillingEnabled()) throw new HttpError(503, "El plan Team no está configurado en este servidor");
    const workspace = await activeWorkspace(auth);
    if (!workspace) throw new HttpError(400, "No tienes un equipo activo");
    if (!canManage(workspace.role)) throw new HttpError(403, "Solo los admins del equipo manejan el plan");

    const origin = new URL(request.url).origin;
    const customer = await teamCustomer(workspace.id, workspace.name, auth.user.email);
    const sub = await getTeamSubscription(workspace.id);

    if (sub?.stripeSubscriptionId && ["active", "trialing", "past_due"].includes(sub.status)) {
      const portal = await stripe().billingPortal.sessions.create({ customer, return_url: `${origin}/workspace?tab=plan` });
      return Response.json({ url: portal.url });
    }

    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price: process.env.STRIPE_PRICE_TEAM!, quantity: Math.max(1, await memberCount(workspace.id)) }],
      subscription_data: { metadata: { organizationId: workspace.id } },
      metadata: { organizationId: workspace.id },
      success_url: `${origin}/workspace?tab=plan&checkout=ok`,
      cancel_url: `${origin}/workspace?tab=plan`,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    return handleError(err);
  }
}
