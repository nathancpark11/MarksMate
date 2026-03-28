import { randomUUID } from "node:crypto";
import { setSessionCookie } from "@/lib/auth";

export async function POST() {
  const guestUser = {
    id: `guest-${randomUUID()}`,
    username: "Guest",
    isGuest: true,
  };

  await setSessionCookie(guestUser, { persistent: false });

  return Response.json({
    user: {
      ...guestUser,
      needsTutorial: false,
      needsEmail: false,
      lastLoginAt: null,
      planTier: "free",
      planStatus: null,
      dailyUsageCount: 0,
      dailyUsageLimit: 10,
    },
  });
}
