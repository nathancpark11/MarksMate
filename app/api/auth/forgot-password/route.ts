import {
  getForgotPasswordSuccessMessage,
  requestPasswordResetByEmail,
} from "@/lib/passwordReset";
import { enforceRateLimits } from "@/lib/rateLimit";
import { logApiError } from "@/lib/safeLogging";
import { isValidEmail, sanitizeEmail } from "@/lib/userStore";

// Per-email store: max 3 requests per 15 minutes per email.
declare global {
  var __forgotPassEmailStore: Map<string, number[]> | undefined;
}
const emailStore: Map<string, number[]> = globalThis.__forgotPassEmailStore ?? new Map();
if (!globalThis.__forgotPassEmailStore) {
  globalThis.__forgotPassEmailStore = emailStore;
}

function checkEmailLimit(email: string): boolean {
  const windowMs = 15 * 60 * 1000;
  const maxRequests = 3;
  const now = Date.now();
  const key = email.toLowerCase();
  const timestamps = emailStore.get(key) ?? [];
  const recent = timestamps.filter((t) => t > now - windowMs);
  if (recent.length >= maxRequests) {
    emailStore.set(key, recent);
    return false;
  }
  recent.push(now);
  emailStore.set(key, recent);
  return true;
}

export async function POST(req: Request) {
  // Per-IP: max 5 requests per 15 minutes.
  const ipLimitResponse = enforceRateLimits(req, [
    {
      key: "forgot-password:ip",
      maxRequests: 5,
      windowMs: 15 * 60 * 1000,
      errorMessage: "Too many password reset requests from this IP.",
    },
  ]);
  if (ipLimitResponse) {
    return ipLimitResponse;
  }

  try {
    const body = (await req.json()) as { email?: string; identifier?: string };
    const email = sanitizeEmail(body.email || body.identifier || "");

    if (!email || !isValidEmail(email)) {
      return Response.json(
        { error: "Enter a valid email address." },
        { status: 400 }
      );
    }

    // Per-email: max 3 requests per 15 minutes, applied after IP check.
    if (!checkEmailLimit(email)) {
      return Response.json(
        { error: "Too many reset attempts for this email. Try again in 15 minutes." },
        { status: 429 }
      );
    }

    await requestPasswordResetByEmail(email);

    return Response.json({
      success: true,
      message: getForgotPasswordSuccessMessage(),
    });
  } catch (error: unknown) {
    logApiError("forgot-password error", error);
    return Response.json(
      { error: "Unable to process reset request right now." },
      { status: 500 }
    );
  }
}
