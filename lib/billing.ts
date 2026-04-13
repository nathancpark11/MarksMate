export type PlanTier = "free" | "premium";
export type BillingStatus = "trialing" | "active" | "past_due" | "canceled" | null;

export const FREE_DAILY_GENERATION_LIMIT = 30;
export const FREE_SAVED_BULLETS_LIMIT = 10;

function getPremiumBypassUsernames(): Set<string> {
  const raw = process.env.PREMIUM_BYPASS_USERNAMES ?? "";
  return new Set(raw.split(",").map((u) => u.trim().toLowerCase()).filter(Boolean));
}

function getPremiumBypassEmails(): Set<string> {
  const raw = process.env.PREMIUM_BYPASS_EMAILS ?? "";
  return new Set(raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
}

export function isPremiumBypassUser(
  username: string | null | undefined,
  email?: string | null,
) {
  if (username && getPremiumBypassUsernames().has(username.trim().toLowerCase())) {
    return true;
  }

  if (email && getPremiumBypassEmails().has(email.trim().toLowerCase())) {
    return true;
  }

  return false;
}

export function isPremiumEntitled(input: {
  planTier: PlanTier;
  planStatus: BillingStatus;
  subscriptionCurrentPeriodEnd: string | null;
  betaTrialExpiresAt?: string | null;
  username?: string | null;
  email?: string | null;
}): boolean {
  if (isPremiumBypassUser(input.username, input.email)) {
    return true;
  }

  // Check if beta trial is active (grants premium regardless of planTier)
  if (input.betaTrialExpiresAt) {
    const betaEndsAt = new Date(input.betaTrialExpiresAt).getTime();
    if (Number.isFinite(betaEndsAt) && betaEndsAt > Date.now()) {
      return true;
    }
  }

  // Check regular premium subscription
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
