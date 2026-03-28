import { isGuidanceAdminUsername } from "@/lib/admin";
import { requireSessionUser } from "@/lib/auth";
import { ensureSchema, sql } from "@/lib/db";

export const runtime = "nodejs";

const REQUIRED_USERS_COLUMNS = [
	"stripe_customer_id",
	"stripe_subscription_id",
	"plan_tier",
	"plan_status",
	"subscription_current_period_end",
	"daily_usage_count",
	"last_usage_reset_date",
] as const;

type PlanBucket = {
	planTier: string;
	planStatus: string | null;
	userCount: number;
};

function toStringOrNull(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function toNumber(value: unknown): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}

	return 0;
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

	const usersColumnsResult = await sql`
		SELECT column_name
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'users'
	`;
	const presentUsersColumns = new Set(
		usersColumnsResult.rows
			.map((row) => toStringOrNull(row.column_name))
			.filter((value): value is string => Boolean(value))
	);

	const usersColumns = REQUIRED_USERS_COLUMNS.map((columnName) => ({
		columnName,
		present: presentUsersColumns.has(columnName),
	}));

	const webhookTableResult = await sql`
		SELECT EXISTS (
			SELECT 1
			FROM information_schema.tables
			WHERE table_schema = 'public' AND table_name = 'stripe_webhook_events'
		) AS exists
	`;
	const webhookTableExists = webhookTableResult.rows[0]?.exists === true;

	const planCountsResult = await sql`
		SELECT
			COALESCE(plan_tier, 'free') AS plan_tier,
			plan_status,
			COUNT(*)::int AS user_count
		FROM users
		GROUP BY plan_tier, plan_status
		ORDER BY plan_tier ASC, plan_status ASC
	`;

	const planBuckets: PlanBucket[] = planCountsResult.rows.map((row) => ({
		planTier: toStringOrNull(row.plan_tier) ?? "free",
		planStatus: toStringOrNull(row.plan_status),
		userCount: toNumber(row.user_count),
	}));

	return Response.json(
		{
			ok: true,
			usersColumns,
			webhookTableExists,
			planBuckets,
		},
		{
			headers: {
				"Cache-Control": "no-store",
			},
		}
	);
}
