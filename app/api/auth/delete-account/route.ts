import { clearSessionCookie, requireSessionUser } from "@/lib/auth";
import { getStripeClient } from "@/lib/stripe";
import { deleteUserById, findUserById } from "@/lib/userStore";
import { logApiError } from "@/lib/safeLogging";

async function cancelStripeSubscriptionsForUser(userId: string) {
  const storedUser = await findUserById(userId);
  if (!storedUser) {
    return;
  }

  const stripe = getStripeClient();
  const subscriptionIds = new Set<string>();

  if (storedUser.stripeSubscriptionId) {
    subscriptionIds.add(storedUser.stripeSubscriptionId);
  }

  if (storedUser.stripeCustomerId) {
    const subscriptions = await stripe.subscriptions.list({
      customer: storedUser.stripeCustomerId,
      status: "all",
      limit: 100,
    });

    for (const subscription of subscriptions.data) {
      if (typeof subscription.id === "string") {
        subscriptionIds.add(subscription.id);
      }
    }
  }

  for (const subscriptionId of subscriptionIds) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (subscription.status === "canceled" || subscription.status === "incomplete_expired") {
      continue;
    }

    await stripe.subscriptions.cancel(subscriptionId, {
      cancellation_details: {
        feedback: "other",
        comment: "Trial Period",
      },
    });
  }
}

export async function DELETE() {
  const { user, response } = await requireSessionUser();
  if (response) {
    return response;
  }

  try {
    await cancelStripeSubscriptionsForUser(user.id);
    await deleteUserById(user.id);
    await clearSessionCookie();
    return Response.json({ ok: true });
  } catch (error: unknown) {
    logApiError("delete-account error", error);
    return Response.json(
      { error: "Failed to delete account. If you have an active subscription, it was not canceled." },
      { status: 500 }
    );
  }
}
