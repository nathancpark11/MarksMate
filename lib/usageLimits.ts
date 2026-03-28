import { FREE_DAILY_GENERATION_LIMIT, isPremiumEntitled } from "@/lib/billing";
import { ensureSchema, sql } from "@/lib/db";
import { findUserById } from "@/lib/userStore";

function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function resetDailyUsageIfNeeded(userId: string) {
  await ensureSchema();
  const today = utcDateKey();

  await sql`
    UPDATE users
    SET
      daily_usage_count = CASE
        WHEN last_usage_reset_date IS NULL OR last_usage_reset_date <> ${today} THEN 0
        ELSE daily_usage_count
      END,
      last_usage_reset_date = CASE
        WHEN last_usage_reset_date IS NULL OR last_usage_reset_date <> ${today} THEN ${today}
        ELSE last_usage_reset_date
      END,
      updated_at = NOW()
    WHERE id = ${userId}
  `;
}

export async function getUsageSummary(userId: string) {
  await resetDailyUsageIfNeeded(userId);
  const user = await findUserById(userId);
  if (!user) {
    return null;
  }

  const premium = isPremiumEntitled({
    planTier: user.planTier,
    planStatus: user.planStatus,
    subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd,
    username: user.username,
    email: user.emailLower,
  });
  return {
    planTier: premium ? "premium" : user.planTier,
    planStatus: user.planStatus,
    subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd,
    dailyUsageCount: user.dailyUsageCount,
    dailyUsageLimit: premium ? null : FREE_DAILY_GENERATION_LIMIT,
    premium,
  };
}

export async function enforceGenerationAccess(userId: string) {
  const summary = await getUsageSummary(userId);
  if (!summary) {
    return { allowed: false as const, reason: "User not found.", code: "USER_NOT_FOUND" as const };
  }

  if (summary.premium) {
    return { allowed: true as const, summary };
  }

  if (summary.dailyUsageCount >= FREE_DAILY_GENERATION_LIMIT) {
    return {
      allowed: false as const,
      reason: "You have reached your daily free limit. Upgrade to Premium for unlimited bullets.",
      code: "FREE_DAILY_LIMIT_REACHED" as const,
      summary,
    };
  }

  return { allowed: true as const, summary };
}

export async function incrementDailyGenerationUsage(userId: string) {
  await resetDailyUsageIfNeeded(userId);
  await ensureSchema();
  await sql`
    UPDATE users
    SET daily_usage_count = daily_usage_count + 1, updated_at = NOW()
    WHERE id = ${userId}
  `;
}

export async function enforcePremiumFeatureAccess(userId: string, featureName: string) {
  const summary = await getUsageSummary(userId);
  if (!summary) {
    return { allowed: false as const, reason: "User not found.", code: "USER_NOT_FOUND" as const };
  }

  if (summary.premium) {
    return { allowed: true as const, summary };
  }

  return {
    allowed: false as const,
    reason: `${featureName} is a Premium feature. Upgrade to continue.`,
    code: "PREMIUM_REQUIRED" as const,
    summary,
  };
}
