import Stripe from "stripe";
import { ensureSchema, sql } from "@/lib/db";
import { normalizeBillingStatus, normalizePlanTier } from "@/lib/billing";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/stripe";
import { updateUserSubscriptionByStripeCustomerId } from "@/lib/userStore";

function toIsoFromUnix(seconds: number | null | undefined) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
    return null;
  }
  return new Date(seconds * 1000).toISOString();
}

function isCanceledStillPremium(periodEndIso: string | null) {
  if (!periodEndIso) {
    return false;
  }

  const periodEnd = new Date(periodEndIso).getTime();
  return Number.isFinite(periodEnd) && periodEnd > Date.now();
}

async function markEventProcessed(event: Stripe.Event) {
  const objectId =
    event.data && event.data.object && typeof (event.data.object as { id?: unknown }).id === "string"
      ? ((event.data.object as { id?: string }).id ?? null)
      : null;

  await sql`
    INSERT INTO stripe_webhook_events (event_id, event_type, stripe_object_id)
    VALUES (
      ${event.id},
      ${event.type},
      ${objectId}
    )
  `;
}

async function wasEventAlreadyProcessed(eventId: string) {
  const existing = await sql`
    SELECT event_id
    FROM stripe_webhook_events
    WHERE event_id = ${eventId}
    LIMIT 1
  `;

  return existing.rows.length > 0;
}

async function applySubscriptionState(subscription: Stripe.Subscription) {
  const subscriptionData = subscription as unknown as {
    status?: string;
    current_period_end?: number;
    customer?: string;
    id?: string;
  };
  const periodEndIso = toIsoFromUnix(subscriptionData.current_period_end);
  const rawStatus = normalizeBillingStatus(subscriptionData.status);
  const canceledButActive = rawStatus === "canceled" && isCanceledStillPremium(periodEndIso);
  const stripeCustomerId =
    typeof subscriptionData.customer === "string" ? subscriptionData.customer : null;

  if (!stripeCustomerId) {
    return;
  }

  const planTier = canceledButActive
    ? "premium"
    : rawStatus === "active" || rawStatus === "trialing" || rawStatus === "past_due"
      ? "premium"
      : "free";

  await updateUserSubscriptionByStripeCustomerId({
    stripeCustomerId,
    stripeSubscriptionId: typeof subscriptionData.id === "string" ? subscriptionData.id : null,
    planTier: normalizePlanTier(planTier),
    planStatus: rawStatus,
    subscriptionCurrentPeriodEnd: periodEndIso,
  });
}

export async function POST(req: Request) {
  await ensureSchema();

  const payload = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(payload, signature, getStripeWebhookSecret());
  } catch {
    return Response.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  if (await wasEventAlreadyProcessed(event.id)) {
    return Response.json({ received: true, idempotent: true });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription && session.customer) {
        const stripe = getStripeClient();
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        await applySubscriptionState(subscription);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      await applySubscriptionState(subscription);
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const subscriptionData = subscription as unknown as {
        customer?: string;
        id?: string;
        current_period_end?: number;
      };
      if (typeof subscriptionData.customer !== "string") {
        break;
      }
      await updateUserSubscriptionByStripeCustomerId({
        stripeCustomerId: subscriptionData.customer,
        stripeSubscriptionId: typeof subscriptionData.id === "string" ? subscriptionData.id : null,
        planTier: "free",
        planStatus: "canceled",
        subscriptionCurrentPeriodEnd: toIsoFromUnix(subscriptionData.current_period_end),
      });
      break;
    }
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceData = invoice as unknown as { subscription?: string };
      if (typeof invoiceData.subscription === "string") {
        const stripe = getStripeClient();
        const subscription = (await stripe.subscriptions.retrieve(
          invoiceData.subscription
        )) as unknown as Stripe.Subscription;
        await applySubscriptionState(subscription);
      }
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceData = invoice as unknown as { subscription?: string; customer?: string };
      if (typeof invoiceData.subscription === "string" && typeof invoiceData.customer === "string") {
        const stripe = getStripeClient();
        const subscription = (await stripe.subscriptions.retrieve(
          invoiceData.subscription
        )) as unknown as {
          id?: string;
          current_period_end?: number;
        };
        await updateUserSubscriptionByStripeCustomerId({
          stripeCustomerId: invoiceData.customer,
          stripeSubscriptionId: typeof subscription.id === "string" ? subscription.id : null,
          planTier: "premium",
          planStatus: "past_due",
          subscriptionCurrentPeriodEnd: toIsoFromUnix(subscription.current_period_end),
        });
      }
      break;
    }
    default:
      break;
  }

  try {
    await markEventProcessed(event);
  } catch {
    // If duplicate insert races, still respond success because event state was already applied.
  }

  return Response.json({ received: true });
}
