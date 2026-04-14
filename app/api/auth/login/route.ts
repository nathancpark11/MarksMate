import {
  findUserByUsernameOrEmail,
  sanitizeUsername,
  updateUserLastLoginById,
} from "@/lib/userStore";
import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { logApiError } from "@/lib/safeLogging";
import { getUsageSummary } from "@/lib/usageLimits";
import { enforceRateLimits } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const rateLimitResponse = enforceRateLimits(req, [
    {
      key: "login-per-minute",
      maxRequests: 10,
      windowMs: 60_000,
      errorMessage: "Too many login attempts. Try again in a minute.",
    },
    {
      key: "login-per-15min",
      maxRequests: 20,
      windowMs: 15 * 60_000,
      errorMessage: "Too many login attempts from this IP. Try again later.",
    },
  ]);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = (await req.json()) as {
      identifier?: string;
      username?: string;
      password?: string;
    };

    const identifier = sanitizeUsername(body.identifier || body.username || "");
    const password = body.password || "";

    if (!identifier || !password) {
      return Response.json(
        { error: "Username/email and password are required." },
        { status: 400 }
      );
    }

    const user = await findUserByUsernameOrEmail(identifier);
    if (!user) {
      return Response.json(
        { error: "Invalid username or password." },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return Response.json(
        { error: "Invalid username or password." },
        { status: 401 }
      );
    }

    let lastLoginAt: string | null = null;
    try {
      lastLoginAt = new Date().toISOString();
      await updateUserLastLoginById(user.id);
    } catch {
      // Best effort: login should still succeed if metadata update fails.
    }

    await setSessionCookie({ id: user.id, username: user.username });

    const usageSummary = await getUsageSummary(user.id);

    return Response.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        needsTutorial: !user.hasCompletedTutorial,
        needsEmail: !user.emailLower,
        lastLoginAt,
        planTier: usageSummary?.planTier ?? "free",
        planStatus: usageSummary?.planStatus ?? null,
        subscriptionCurrentPeriodEnd:
          usageSummary?.subscriptionCurrentPeriodEnd ?? user.subscriptionCurrentPeriodEnd ?? null,
        betaTrialExpiresAt: usageSummary?.betaTrialExpiresAt ?? user.betaTrialExpiresAt ?? null,
        betaTrialRedeemedAt: user.betaTrialRedeemedAt ?? null,
        hasBillingProfile: !!user.stripeCustomerId,
        dailyUsageCount: usageSummary?.dailyUsageCount ?? 0,
        dailyUsageLimit: usageSummary ? usageSummary.dailyUsageLimit : 10,
      },
    });
  } catch (error: unknown) {
    logApiError("login error", error);
    return Response.json({ error: "Failed to log in." }, { status: 500 });
  }
}
