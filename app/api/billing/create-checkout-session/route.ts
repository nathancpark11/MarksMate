import { requireSessionUser } from "@/lib/auth";
import {
  findUserById,
  updateUserStripeCustomerIdById,
} from "@/lib/userStore";
import {
  getStripeCancelUrl,
  getStripeClient,
  getStripePriceId,
  getStripeSuccessUrl,
} from "@/lib/stripe";

export async function POST(req: Request) {
  const { user, response } = await requireSessionUser();
  if (response) {
    return response;
  }

  if (user.isGuest) {
    return Response.json({ error: "Guest sessions cannot create subscriptions." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    billingCycle?: "monthly" | "yearly";
  };

  const billingCycle = body.billingCycle === "yearly" ? "yearly" : "monthly";
  const priceId = getStripePriceId(billingCycle);

  const storedUser = await findUserById(user.id);
  if (!storedUser) {
    return Response.json({ error: "User not found." }, { status: 404 });
  }

  const stripe = getStripeClient();
  let customerId = storedUser.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: storedUser.email ?? undefined,
      name: storedUser.username,
      metadata: {
        appUserId: storedUser.id,
      },
    });
    customerId = customer.id;
    await updateUserStripeCustomerIdById(storedUser.id, customer.id);
  }

  const existingSubs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });
  const hasUsedTrial = existingSubs.data.some((sub) => {
    if (sub.status === "trialing") {
      return true;
    }
    return typeof sub.trial_start === "number" && sub.trial_start > 0;
  });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    success_url: getStripeSuccessUrl(),
    cancel_url: getStripeCancelUrl(),
    payment_method_collection: "always",
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    metadata: {
      appUserId: storedUser.id,
      billingCycle,
    },
    subscription_data: {
      metadata: {
        appUserId: storedUser.id,
      },
      ...(hasUsedTrial ? {} : { trial_period_days: 7 }),
    },
    allow_promotion_codes: true,
  });

  if (!session.url) {
    return Response.json({ error: "Failed to create checkout session." }, { status: 500 });
  }

  return Response.json({
    url: session.url,
    sessionId: session.id,
    billingCycle,
    trialApplied: !hasUsedTrial,
  });
}
