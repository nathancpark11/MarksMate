export type PlanTier = "free" | "premium";
export type BillingStatus = "trialing" | "active" | "past_due" | "canceled" | null;

export const FREE_DAILY_GENERATION_LIMIT = 5;
export const FREE_SAVED_BULLETS_LIMIT = 10;

const PREMIUM_BYPASS_USERNAMES = new Set(["nathancpark11"]);
const PREMIUM_BYPASS_EMAILS = new Set(["newproductionsmusic@gmail.com"]);

export function isPremiumBypassUser(
  username: string | null | undefined,
  email?: string | null,
) {
  if (username && PREMIUM_BYPASS_USERNAMES.has(username.trim().toLowerCase())) {
    return true;
  }

  if (email && PREMIUM_BYPASS_EMAILS.has(email.trim().toLowerCase())) {
    return true;
  }

  return false;
}

export function isPremiumEntitled(input: {
  planTier: PlanTier;
  planStatus: BillingStatus;
  subscriptionCurrentPeriodEnd: string | null;
  username?: string | null;
  email?: string | null;
}): boolean {
  if (isPremiumBypassUser(input.username, input.email)) {
    return true;
  }

  if (input.planTier !== "premium") {
    return false;
  }

  if (input.planStatus === "active" || input.planStatus === "trialing") {
    return true;
  }

  if (input.planStatus === "canceled") {
    if (!input.subscriptionCurrentPeriodEnd) {
      return false;
    }
    const endsAt = new Date(input.subscriptionCurrentPeriodEnd).getTime();
    return Number.isFinite(endsAt) && endsAt > Date.now();
  }

  return false;
}

export function normalizeBillingStatus(status: string | null | undefined): BillingStatus {
  if (!status) {
    return null;
  }

  const normalized = status.trim().toLowerCase();
  if (
    normalized === "trialing" ||
    normalized === "active" ||
    normalized === "past_due" ||
    normalized === "canceled"
  ) {
    return normalized;
  }

  return null;
}

export function normalizePlanTier(tier: string | null | undefined): PlanTier {
  if (typeof tier === "string" && tier.trim().toLowerCase() === "premium") {
    return "premium";
  }

  return "free";
}
