import { requireSessionUser } from "@/lib/auth";
import {
  findUserByEmail,
  isValidEmail,
  sanitizeEmail,
  updateUserEmailById,
} from "@/lib/userStore";
import { logApiError } from "@/lib/safeLogging";

export async function POST(req: Request) {
  const { user, response } = await requireSessionUser();
  if (response || !user) {
    return response;
  }

  if (user.isGuest) {
    return Response.json({ error: "Guest sessions cannot add email." }, { status: 400 });
  }

  try {
    const body = (await req.json()) as { email?: string };
    const email = sanitizeEmail(body.email || "");

    if (!email) {
      return Response.json({ error: "Email is required." }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const existing = await findUserByEmail(email);
    if (existing && existing.id !== user.id) {
      return Response.json({ error: "That email is already in use." }, { status: 409 });
    }

    const updated = await updateUserEmailById(user.id, email);
    if (!updated) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    return Response.json({
      success: true,
      user: {
        id: updated.id,
        username: updated.username,
        email: updated.email,
        needsTutorial: !updated.hasCompletedTutorial,
        needsEmail: !updated.emailLower,
        lastLoginAt: updated.lastLoginAt,
        planTier: updated.planTier,
        planStatus: updated.planStatus,
        subscriptionCurrentPeriodEnd: updated.subscriptionCurrentPeriodEnd,
        betaTrialExpiresAt: updated.betaTrialExpiresAt,
        betaTrialRedeemedAt: updated.betaTrialRedeemedAt,
        hasBillingProfile: !!updated.stripeCustomerId,
        dailyUsageCount: updated.dailyUsageCount,
        dailyUsageLimit: 10,
      },
    });
  } catch (error: unknown) {
    logApiError("add-email error", error);
    return Response.json({ error: "Failed to save email." }, { status: 500 });
  }
}
