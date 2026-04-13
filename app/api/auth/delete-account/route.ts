import { clearSessionCookie, requireSessionUser } from "@/lib/auth";
import { getStripeClient } from "@/lib/stripe";
import { deleteUserById, findUserById } from "@/lib/userStore";
import { getSafeErrorDetails, logApiError } from "@/lib/safeLogging";

function isMissingStripeResource(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    statusCode?: unknown;
    status?: unknown;
    code?: unknown;
    type?: unknown;
    raw?: { code?: unknown; type?: unknown };
  };

  return (
    candidate.statusCode === 404 ||
    candidate.status === 404 ||
    candidate.code === "resource_missing" ||
    candidate.type === "StripeInvalidRequestError" ||
    candidate.raw?.code === "resource_missing" ||
    candidate.raw?.type === "invalid_request_error"
  );
}

async function cancelStripeSubscriptionsForUser(userId: string) {
  const storedUser = await findUserById(userId);
  if (!storedUser) {
    return;
  }

  const subscriptionIds = new Set<string>();
  const hasStripeBillingProfile =
    Boolean(storedUser.stripeSubscriptionId) || Boolean(storedUser.stripeCustomerId);

  if (!hasStripeBillingProfile) {
    return;
  }

  const stripe = getStripeClient();

  if (storedUser.stripeSubscriptionId) {
    subscriptionIds.add(storedUser.stripeSubscriptionId);
  }

  if (storedUser.stripeCustomerId) {
    try {
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
    } catch (error: unknown) {
      if (!isMissingStripeResource(error)) {
        throw error;
      }

      logApiError("delete-account missing stripe customer", error, {
        userId,
        stripeCustomerId: storedUser.stripeCustomerId,
      });
    }
  }

  for (const subscriptionId of subscriptionIds) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (subscription.status === "canceled" || subscription.status === "incomplete_expired") {
        continue;
      }

      await stripe.subscriptions.cancel(subscriptionId);
    } catch (error: unknown) {
      if (!isMissingStripeResource(error)) {
        throw error;
      }

      logApiError("delete-account missing stripe subscription", error, {
        userId,
        subscriptionId,
      });
    }
  }
}

export async function DELETE() {
  const { user, response } = await requireSessionUser();
  if (response) {
    return response;
  }

  let failedStep = "cancel-subscriptions";

  try {
    await cancelStripeSubscriptionsForUser(user.id);
    failedStep = "delete-user";
    await deleteUserById(user.id);
    failedStep = "clear-session-cookie";
    await clearSessionCookie();
    return Response.json({ ok: true });
  } catch (error: unknown) {
    const errorDetails = getSafeErrorDetails(error);

    logApiError("delete-account error", error, {
      userId: user.id,
      failedStep,
    });

    const isProduction = process.env.NODE_ENV === "production";
    const detail = !isProduction
      ? errorDetails.errorMessage ?? errorDetails.errorName ?? "Unknown error"
      : undefined;

    return Response.json(
      {
        error: isProduction
          ? "Failed to delete account. If you have an active subscription, it was not canceled."
          : `Failed to delete account during ${failedStep}. ${detail}`,
      },
      { status: 500 }
    );
  }
}
