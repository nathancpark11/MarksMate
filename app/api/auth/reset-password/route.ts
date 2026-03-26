import {
  resetPasswordWithToken,
  validatePasswordResetToken,
} from "@/lib/passwordReset";
import { enforceRateLimits } from "@/lib/rateLimit";
import { logApiError } from "@/lib/safeLogging";

export async function GET(req: Request) {
  const ipLimitResponse = enforceRateLimits(req, [
    {
      key: "reset-password-validate:ip",
      maxRequests: 20,
      windowMs: 15 * 60 * 1000,
      errorMessage: "Too many reset link validation attempts from this IP.",
    },
  ]);
  if (ipLimitResponse) {
    return ipLimitResponse;
  }

  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token") || "";

    const result = await validatePasswordResetToken(token);
    if (!result.success) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json({ success: true });
  } catch (error: unknown) {
    logApiError("reset-password validate error", error);
    return Response.json({ error: "Unable to validate reset link." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  // Per-IP: max 10 attempts per 15 minutes.
  const ipLimitResponse = enforceRateLimits(req, [
    {
      key: "reset-password:ip",
      maxRequests: 10,
      windowMs: 15 * 60 * 1000,
      errorMessage: "Too many password reset attempts from this IP.",
    },
  ]);
  if (ipLimitResponse) {
    return ipLimitResponse;
  }

  try {
    const body = (await req.json()) as {
      token?: string;
      newPassword?: string;
    };

    const result = await resetPasswordWithToken({
      token: body.token || "",
      newPassword: body.newPassword || "",
    });

    if (!result.success) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json({ success: true });
  } catch (error: unknown) {
    logApiError("reset-password error", error);
    return Response.json({ error: "Failed to reset password." }, { status: 500 });
  }
}
