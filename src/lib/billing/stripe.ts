import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

let client: Stripe | null = null;

export function stripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_PRO);
}

export function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe no está configurado");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

/**
 * Busca o crea el customer de Stripe del usuario y lo guarda en su suscripción.
 */
export async function ensureCustomer(user: { id: string; email: string; name: string }) {
  const sub = await db.query.subscription.findFirst({ where: eq(schema.subscription.userId, user.id) });
  if (sub?.stripeCustomerId) return sub.stripeCustomerId;
  const customer = await stripe().customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId: user.id },
  });
  await db
    .insert(schema.subscription)
    .values({ userId: user.id, stripeCustomerId: customer.id })
    .onConflictDoUpdate({ target: schema.subscription.userId, set: { stripeCustomerId: customer.id } });
  return customer.id;
}

/**
 * Copia el estado de una suscripción de Stripe a la base de datos.
 */
export async function syncSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const periodEnd = sub.items.data[0]?.current_period_end;
  const active = ["active", "trialing", "past_due"].includes(sub.status);
  await db
    .update(schema.subscription)
    .set({
      plan: active ? "pro" : "free",
      status: sub.status,
      stripeSubscriptionId: sub.id,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.subscription.stripeCustomerId, customerId));
}
