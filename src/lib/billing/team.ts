import { and, count, eq, inArray } from "drizzle-orm";
import type Stripe from "stripe";
import { db, schema } from "@/lib/db";
import { stripe } from "./stripe";

const ACTIVE = ["active", "trialing", "past_due"];

export function teamBillingEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_TEAM);
}

export async function memberCount(organizationId: string) {
  const [row] = await db.select({ n: count() }).from(schema.member).where(eq(schema.member.organizationId, organizationId));
  return row?.n ?? 0;
}

/**
 * Dice si el usuario es miembro de algún equipo con plan Team activo. En ese
 * caso tiene los mismos límites que Pro.
 */
export async function hasActiveTeam(userId: string) {
  const rows = await db
    .select({ status: schema.orgSubscription.status })
    .from(schema.member)
    .innerJoin(schema.orgSubscription, eq(schema.orgSubscription.organizationId, schema.member.organizationId))
    .where(and(eq(schema.member.userId, userId), inArray(schema.orgSubscription.status, ACTIVE)))
    .limit(1);
  return rows.length > 0;
}

export async function getTeamSubscription(organizationId: string) {
  return db.query.orgSubscription.findFirst({ where: eq(schema.orgSubscription.organizationId, organizationId) });
}

/**
 * Ajusta la cantidad de asientos en Stripe al número actual de miembros. Stripe
 * prorratea el cambio en la próxima factura.
 */
export async function syncSeats(organizationId: string) {
  const seats = await memberCount(organizationId);
  const sub = await getTeamSubscription(organizationId);
  if (!sub) return;
  await db.update(schema.orgSubscription).set({ seats, updatedAt: new Date() }).where(eq(schema.orgSubscription.organizationId, organizationId));
  if (!sub.stripeSubscriptionId || !ACTIVE.includes(sub.status) || !process.env.STRIPE_SECRET_KEY) return;
  try {
    const remote = await stripe().subscriptions.retrieve(sub.stripeSubscriptionId);
    const item = remote.items.data[0];
    if (item && item.quantity !== seats && seats > 0) {
      await stripe().subscriptions.update(remote.id, {
        items: [{ id: item.id, quantity: seats }],
        proration_behavior: "create_prorations",
      });
    }
  } catch (err) {
    console.error("[stripe] no se pudieron sincronizar los asientos:", (err as Error).message);
  }
}

/**
 * Copia a la base de datos el estado de una suscripción Team de Stripe.
 */
export async function syncTeamSubscription(sub: Stripe.Subscription, organizationId: string) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const item = sub.items.data[0];
  const values = {
    status: sub.status,
    seats: item?.quantity ?? 0,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
    updatedAt: new Date(),
  };
  await db
    .insert(schema.orgSubscription)
    .values({ organizationId, ...values })
    .onConflictDoUpdate({ target: schema.orgSubscription.organizationId, set: values });
}
