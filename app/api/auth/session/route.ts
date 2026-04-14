import { getSessionUserFromCookies } from "@/lib/auth";
import { findUserById } from "@/lib/userStore";
import { getUsageSummary } from "@/lib/usageLimits";

export async function GET() {
  const user = await getSessionUserFromCookies();

  if (!user) {
    return Response.json({ authenticated: false, user: null }, { status: 200 });
  }

  

  if (user.isGuest) {
    return Response.json({
      authenticated: true,
      user: {
        ...user,
        email: null,
        needsTutorial: false,
        needsEmail: false,
        lastLoginAt: null,
        planTier: "free",
        planStatus: null,
        subscriptionCurrentPeriodEnd: null,
        betaTrialExpiresAt: null,
        betaTrialRedeemedAt: null,
        hasBillingProfile: false,
        dailyUsageCount: 0,
        dailyUsageLimit: 10,
      },
    });
  }

  const storedUser = await findUserById(user.id);
  const usageSummary = storedUser ? await getUsageSummary(storedUser.id) : null;

  return Response.json({
    authenticated: true,
    user: {
      ...user,
      email: storedUser?.email ?? null,
      needsTutorial: storedUser ? !storedUser.hasCompletedTutorial : false,
      needsEmail: storedUser ? !storedUser.emailLower : true,
      lastLoginAt: storedUser?.lastLoginAt ?? null,
      planTier: usageSummary?.planTier ?? "free",
      planStatus: usageSummary?.planStatus ?? null,
      subscriptionCurrentPeriodEnd: usageSummary?.subscriptionCurrentPeriodEnd ?? storedUser?.subscriptionCurrentPeriodEnd ?? null,
      betaTrialExpiresAt: usageSummary?.betaTrialExpiresAt ?? storedUser?.betaTrialExpiresAt ?? null,
      betaTrialRedeemedAt: storedUser?.betaTrialRedeemedAt ?? null,
      hasBillingProfile: !!storedUser?.stripeCustomerId,
      dailyUsageCount: usageSummary?.dailyUsageCount ?? 0,
      dailyUsageLimit: usageSummary ? usageSummary.dailyUsageLimit : 10,
    },
  });
}
