import { getSessionUserFromCookies } from "@/lib/auth";
import { findUserById } from "@/lib/userStore";

export async function GET() {
  const user = await getSessionUserFromCookies();

  if (!user) {
    return Response.json({ authenticated: false, user: null }, { status: 200 });
  }

  if (user.isGuest) {
    return Response.json({
      authenticated: true,
      user: {
        ...user,
        needsTutorial: false,
        lastLoginAt: null,
      },
    });
  }

  const storedUser = await findUserById(user.id);

  return Response.json({
    authenticated: true,
    user: {
      ...user,
      needsTutorial: storedUser ? !storedUser.hasCompletedTutorial : false,
      lastLoginAt: storedUser?.lastLoginAt ?? null,
    },
  });
}
