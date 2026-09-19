import type Stripe from "stripe";
import { stripe, syncSubscription } from "@/lib/billing/stripe";

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return new Response("Webhook no configurado", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(await request.text(), signature, secret);
  } catch {
    return new Response("Firma inválida", { status: 400 });
  }

  if (SUBSCRIPTION_EVENTS.has(event.type)) {
    await syncSubscription(event.data.object as Stripe.Subscription);
  } else if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.subscription) {
      const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      await syncSubscription(await stripe().subscriptions.retrieve(id));
    }
  }

  return Response.json({ received: true });
}
