import { isGuidanceAdminUsername } from "@/lib/admin";
import { getAdminAnalyticsSnapshot } from "@/lib/analytics/service";
import { requireSessionUser } from "@/lib/auth";
import { enforceRateLimits } from "@/lib/rateLimit";
import { getRequestId, logApiError, logApiRequestMetadata } from "@/lib/safeLogging";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const routeName = "/api/admin/analytics/overview";
  const requestId = getRequestId(req);

  try {
    const { user, response } = await requireSessionUser();
    if (response || !user) {
      return response ?? Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isGuidanceAdminUsername(user.username)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const rateLimitResponse = enforceRateLimits(req, [
      {
        key: "admin-analytics-overview-per-minute",
        maxRequests: 20,
        windowMs: 60_000,
        errorMessage: "Admin analytics request limit reached.",
      },
    ]);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const snapshot = await getAdminAnalyticsSnapshot({ maskEmails: true });
    logApiRequestMetadata({ requestId, routeName, inputLength: 0, success: true, status: 200 });

    return Response.json(snapshot, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    logApiError("Admin analytics overview error", error, { requestId, routeName, success: false });
    logApiRequestMetadata({ requestId, routeName, inputLength: 0, success: false, status: 500 });
    return Response.json({ error: "Unable to load admin analytics right now." }, { status: 500 });
  }
}
