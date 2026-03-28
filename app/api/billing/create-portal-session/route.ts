import { requireSessionUser } from "@/lib/auth";
import { findUserById } from "@/lib/userStore";
import { getStripeClient } from "@/lib/stripe";

export async function POST() {
  const { user, response } = await requireSessionUser();
  if (response) {
    return response;
  }

  if (user.isGuest) {
    return Response.json({ error: "Guest sessions cannot manage subscriptions." }, { status: 403 });
  }

  const storedUser = await findUserById(user.id);
  if (!storedUser?.stripeCustomerId) {
    return Response.json({ error: "No Stripe customer linked to this account." }, { status: 400 });
  }

  const stripe = getStripeClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  if (!appUrl) {
    return Response.json({ error: "Server misconfiguration: APP URL is not set." }, { status: 500 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: storedUser.stripeCustomerId,
    return_url: `${appUrl.replace(/\/$/, "")}/settings`,
  });

  return Response.json({ url: session.url });
}
