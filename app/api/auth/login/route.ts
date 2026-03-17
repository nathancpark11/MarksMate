import {
  findUserByUsername,
  sanitizeUsername,
  updateUserLastLoginById,
} from "@/lib/userStore";
import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { logApiError } from "@/lib/safeLogging";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      username?: string;
      password?: string;
    };

    const username = sanitizeUsername(body.username || "");
    const password = body.password || "";

    if (!username || !password) {
      return Response.json(
        { error: "Username and password are required." },
        { status: 400 }
      );
    }

    const user = await findUserByUsername(username);
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

    return Response.json({
      user: {
        id: user.id,
        username: user.username,
        needsTutorial: !user.hasCompletedTutorial,
        lastLoginAt,
      },
    });
  } catch (error: unknown) {
    logApiError("login error", error);
    return Response.json({ error: "Failed to log in." }, { status: 500 });
  }
}
