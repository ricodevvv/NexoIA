import { ensureCustomer, stripe, stripeEnabled } from "@/lib/billing/stripe";
import { apiUser, handleError, HttpError } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const user = await apiUser();
    if (!stripeEnabled()) throw new HttpError(503, "Los pagos no están configurados en este servidor");
    const customer = await ensureCustomer(user);
    const origin = new URL(request.url).origin;
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price: process.env.STRIPE_PRICE_PRO!, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: user.id,
      success_url: `${origin}/settings?tab=billing&checkout=ok`,
      cancel_url: `${origin}/settings?tab=billing`,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    return handleError(err);
  }
}
