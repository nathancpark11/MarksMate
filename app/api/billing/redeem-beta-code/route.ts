import { requireSessionUser } from "@/lib/auth";
import { findUserById, redeemBetaTrialByUserId } from "@/lib/userStore";

const TESTER_BETA_CODE = "TESTER";
const BETA_TRIAL_DAYS = 14;

type RedeemRequestBody = {
  code?: string;
};

export async function POST(req: Request) {
  const { user, response } = await requireSessionUser();
  if (response) {
    return response;
  }

  if (user.isGuest) {
    return Response.json({ error: "Guest sessions cannot redeem beta access." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as RedeemRequestBody;
  const candidateCode = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";

  if (!candidateCode) {
    return Response.json({ error: "Enter a beta code." }, { status: 400 });
  }

  if (candidateCode !== TESTER_BETA_CODE) {
    return Response.json({ error: "Invalid beta code." }, { status: 400 });
  }

  const storedUser = await findUserById(user.id);
  if (!storedUser) {
    return Response.json({ error: "User not found." }, { status: 404 });
  }

  if (storedUser.planTier === "premium") {
    return Response.json(
      {
        error: "This account already has Premium access.",
        alreadyPremium: true,
        betaTrialExpiresAt: storedUser.betaTrialExpiresAt,
      },
      { status: 409 }
    );
  }

  const nowMs = Date.now();
  if (storedUser.betaTrialExpiresAt) {
    const existingEndsAtMs = new Date(storedUser.betaTrialExpiresAt).getTime();
    if (Number.isFinite(existingEndsAtMs) && existingEndsAtMs > nowMs) {
      return Response.json(
        {
          error: "Beta access is already active on this account.",
          betaTrialExpiresAt: storedUser.betaTrialExpiresAt,
        },
        { status: 409 }
      );
    }
  }

  if (storedUser.betaTrialRedeemedAt) {
    return Response.json(
      {
        error: "This account has already used a beta code.",
        betaTrialRedeemedAt: storedUser.betaTrialRedeemedAt,
      },
      { status: 409 }
    );
  }

  const result = await redeemBetaTrialByUserId({
    userId: storedUser.id,
    durationDays: BETA_TRIAL_DAYS,
  });

  if (!result.granted || !result.expiresAt) {
    return Response.json(
      {
        error: "Unable to redeem this beta code for your account.",
      },
      { status: 409 }
    );
  }

  return Response.json({
    success: true,
    betaTrialExpiresAt: result.expiresAt,
    durationDays: BETA_TRIAL_DAYS,
  });
}
