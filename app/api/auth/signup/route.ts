import { createUser, findUserByUsername, sanitizeUsername } from "@/lib/userStore";
import { hashPassword, setSessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      username?: string;
      password?: string;
    };

    const username = sanitizeUsername(body.username || "");
    const password = (body.password || "").trim();

    if (username.length < 3 || username.length > 40) {
      return Response.json(
        { error: "Username must be 3-40 characters." },
        { status: 400 }
      );
    }

    if (password.length < 8 || password.length > 128) {
      return Response.json(
        { error: "Password must be 8-128 characters." },
        { status: 400 }
      );
    }

    const existing = await findUserByUsername(username);
    if (existing) {
      return Response.json(
        { error: "An account with that username already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser({ username, passwordHash });

    await setSessionCookie({ id: user.id, username: user.username });

    return Response.json({
      user: {
        id: user.id,
        username: user.username,
        needsTutorial: !user.hasCompletedTutorial,
      },
    });
  } catch (error) {
    console.error("signup error", error);
    return Response.json({ error: "Failed to create account." }, { status: 500 });
  }
}
