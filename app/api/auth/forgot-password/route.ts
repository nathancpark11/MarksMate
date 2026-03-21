import { issuePasswordResetCode } from "@/lib/passwordReset";
import { enforceRateLimits } from "@/lib/rateLimit";
import { logApiError } from "@/lib/safeLogging";

// Per-identifier store: max 3 requests per 15 minutes per identifier.
declare global {
  var __forgotPassIdentifierStore: Map<string, number[]> | undefined;
}
const identifierStore: Map<string, number[]> =
  globalThis.__forgotPassIdentifierStore ?? new Map();
if (!globalThis.__forgotPassIdentifierStore) {
  globalThis.__forgotPassIdentifierStore = identifierStore;
}

function checkIdentifierLimit(identifier: string): boolean {
  const windowMs = 15 * 60 * 1000;
  const maxRequests = 3;
  const now = Date.now();
  const key = identifier.toLowerCase();
  const timestamps = identifierStore.get(key) ?? [];
  const recent = timestamps.filter((t) => t > now - windowMs);
  if (recent.length >= maxRequests) {
    identifierStore.set(key, recent);
    return false;
  }
  recent.push(now);
  identifierStore.set(key, recent);
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
    const body = (await req.json()) as { identifier?: string; username?: string };
    const identifier = (body.identifier || body.username || "").trim();

    if (!identifier) {
      return Response.json(
        { error: "Username or email is required." },
        { status: 400 }
      );
    }

    // Per-identifier: max 3 requests per 15 minutes, applied after IP check.
    if (!checkIdentifierLimit(identifier)) {
      return Response.json(
        { error: "Too many reset attempts for this account. Try again in 15 minutes." },
        { status: 429 }
      );
    }

    await issuePasswordResetCode(identifier);

    return Response.json({
      success: true,
      message:
        "If an account with a saved email exists, a verification code has been sent.",
    });
  } catch (error: unknown) {
    logApiError("forgot-password error", error);
    return Response.json(
      { error: "Unable to send verification code right now." },
      { status: 500 }
    );
  }
}
