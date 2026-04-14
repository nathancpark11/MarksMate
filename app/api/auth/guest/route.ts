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
      email: null,
      needsTutorial: false,
      needsEmail: false,
      lastLoginAt: null,
      planTier: "free",
      planStatus: null,
      subscriptionCurrentPeriodEnd: null,
      dailyUsageCount: 0,
      dailyUsageLimit: 10,
    },
  });
}
