import { requireSessionUser } from "@/lib/auth";
import { ensureSchema, sql } from "@/lib/db";
import { findUserById } from "@/lib/userStore";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const { user, response } = await requireSessionUser();
  if (response) return response;

  const storedUser = await findUserById(user.id);
  if (!storedUser) {
    return Response.json({ error: "User not found." }, { status: 404 });
  }

  await ensureSchema();
  const keysResult = await sql`
    SELECT data_key, updated_at
    FROM user_data
    WHERE user_id = ${user.id}
    ORDER BY data_key ASC
  `;

  const dataKeys = keysResult.rows.map((row) => ({
    key: row.data_key as string,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  }));

  return Response.json({
    user: {
      id: storedUser.id,
      username: storedUser.username,
      createdAt: storedUser.createdAt,
      hasCompletedTutorial: storedUser.hasCompletedTutorial,
      lastLoginAt: storedUser.lastLoginAt,
      planTier: storedUser.planTier,
      planStatus: storedUser.planStatus,
      stripeCustomerId: storedUser.stripeCustomerId,
      stripeSubscriptionId: storedUser.stripeSubscriptionId,
      subscriptionCurrentPeriodEnd: storedUser.subscriptionCurrentPeriodEnd,
      dailyUsageCount: storedUser.dailyUsageCount,
      lastUsageResetDate: storedUser.lastUsageResetDate,
      updatedAt: storedUser.updatedAt,
    },
    dataKeys,
  });
}
