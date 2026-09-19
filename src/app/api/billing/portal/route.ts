import { ensureCustomer, stripe, stripeEnabled } from "@/lib/billing/stripe";
import { apiUser, handleError, HttpError } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const user = await apiUser();
    if (!stripeEnabled()) throw new HttpError(503, "Los pagos no están configurados en este servidor");
    const customer = await ensureCustomer(user);
    const session = await stripe().billingPortal.sessions.create({
      customer,
      return_url: `${new URL(request.url).origin}/settings?tab=billing`,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    return handleError(err);
  }
}
