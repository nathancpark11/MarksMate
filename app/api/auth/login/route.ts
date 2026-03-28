import {
  findUserByUsernameOrEmail,
  sanitizeUsername,
  updateUserLastLoginById,
} from "@/lib/userStore";
import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { logApiError } from "@/lib/safeLogging";
import { getUsageSummary } from "@/lib/usageLimits";

export async function POST(req: Request) {
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
        needsTutorial: !user.hasCompletedTutorial,
        needsEmail: !user.emailLower,
        lastLoginAt,
        planTier: usageSummary?.planTier ?? "free",
        planStatus: usageSummary?.planStatus ?? null,
        dailyUsageCount: usageSummary?.dailyUsageCount ?? 0,
        dailyUsageLimit: usageSummary ? usageSummary.dailyUsageLimit : 5,
      },
    });
  } catch (error: unknown) {
    logApiError("login error", error);
    return Response.json({ error: "Failed to log in." }, { status: 500 });
  }
}
