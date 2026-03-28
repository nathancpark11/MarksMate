import { isGuidanceAdminUsername } from "@/lib/admin";
import { requireSessionUser } from "@/lib/auth";
import { ensureSchema, sql } from "@/lib/db";

export const runtime = "nodejs";

type LifecycleMismatch = {
	id: string;
	username: string;
	email: string | null;
	planTier: string;
	planStatus: string | null;
	subscriptionCurrentPeriodEnd: string | null;
	reason: string;
};

function toStringOrNull(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

export async function GET() {
	const { user, response } = await requireSessionUser();
	if (response || !user) {
		return response ?? Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	if (!isGuidanceAdminUsername(user.username)) {
		return Response.json({ error: "Forbidden" }, { status: 403 });
	}

	await ensureSchema();

	const canceledShouldBePremiumResult = await sql`
		SELECT
			id,
			username,
			email,
			plan_tier,
			plan_status,
			subscription_current_period_end,
			'Canceled but still in paid period should remain premium' AS reason
		FROM users
		WHERE plan_status = 'canceled'
			AND subscription_current_period_end IS NOT NULL
			AND subscription_current_period_end > NOW()
			AND COALESCE(plan_tier, 'free') <> 'premium'
		ORDER BY subscription_current_period_end ASC
		LIMIT 100
	`;

	const canceledShouldBeFreeResult = await sql`
		SELECT
			id,
			username,
			email,
			plan_tier,
			plan_status,
			subscription_current_period_end,
			'Canceled and paid period ended should be free' AS reason
		FROM users
		WHERE plan_status = 'canceled'
			AND (
				subscription_current_period_end IS NULL
				OR subscription_current_period_end <= NOW()
			)
			AND COALESCE(plan_tier, 'free') <> 'free'
		ORDER BY subscription_current_period_end ASC NULLS FIRST
		LIMIT 100
	`;

	const mismatches: LifecycleMismatch[] = [
		...canceledShouldBePremiumResult.rows,
		...canceledShouldBeFreeResult.rows,
	].map((row) => ({
		id: toStringOrNull(row.id) ?? "",
		username: toStringOrNull(row.username) ?? "",
		email: toStringOrNull(row.email),
		planTier: toStringOrNull(row.plan_tier) ?? "free",
		planStatus: toStringOrNull(row.plan_status),
		subscriptionCurrentPeriodEnd: toStringOrNull(row.subscription_current_period_end),
		reason: toStringOrNull(row.reason) ?? "Unknown mismatch",
	}));

	return Response.json(
		{
			ok: true,
			mismatchCount: mismatches.length,
			mismatches,
		},
		{
			headers: {
				"Cache-Control": "no-store",
			},
		}
	);
}
