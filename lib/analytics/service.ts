import { ensureSchema, sql } from "@/lib/db";
import {
  computeAverageCostPerActiveUser,
  computeAverageCostPerMark,
  sumEstimatedCostUsd,
} from "@/lib/analytics/pricing";

type UserRow = {
  id: string;
  username: string;
  email: string | null;
  created_at: string;
  last_login_at: string | null;
  plan_status: string | null;
};

type UserDataRow = {
  user_id: string;
  data_key: string;
  data_value: string;
  updated_at: string;
};

type UserAiAggregateRow = {
  user_id: string;
  total_ai_calls: number | string;
  total_prompt_tokens: number | string;
  total_completion_tokens: number | string;
  total_tokens: number | string;
  estimated_ai_cost_usd: number | string;
  generated_bullets: number | string;
  document_upload_count: number | string;
  document_reference_count: number | string;
  retrieval_call_count: number | string;
  doc_context_prompt_tokens: number | string;
  last_ai_at: string | null;
};

type AiLogRow = {
  user_id: string;
  endpoint: string;
  total_tokens: number | string;
  estimated_cost_usd: number | string;
  created_at: string;
  success: boolean;
};

export type AdminUserSummary = {
  userId: string;
  identifier: string;
  rank: string;
  rate: string;
  dateJoined: string;
  activeStatus: "Active" | "Inactive";
  lastActiveDate: string | null;
  totalDailyLogs: number;
  totalGeneratedBullets: number;
  totalCommittedMarks: number;
  totalAiCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  estimatedAiCostUsd: number;
  averageCostPerMarkUsd: number;
};

export type AdminAnalyticsSnapshot = {
  generatedAt: string;
  totals: {
    totalUsers: number;
    activeUsers: number;
    totalBulletsGenerated: number;
    totalCommittedMarks: number;
    averageBulletsPerUser: number;
    averageAiCallsPerUser: number;
    averageTokensPerUser: number;
    totalTokenUsage: number;
    estimatedTotalAiCostUsd: number;
    estimatedAverageCostPerUserUsd: number;
    averageCostPerActiveUserUsd: number;
  };
  usersByRankRate: Array<{ rank: string; rate: string; users: number }>;
  averageCostByRankRate: Array<{ rank: string; rate: string; averageCostUsd: number }>;
  monthlyTrends: Array<{
    month: string;
    newUsers: number;
    activeUsers: number;
    bulletsGenerated: number;
    committedMarks: number;
    aiCalls: number;
    totalTokens: number;
    estimatedCostUsd: number;
  }>;
  mostActiveUsers: Array<{
    userId: string;
    identifier: string;
    rank: string;
    rate: string;
    totalAiCalls: number;
    totalGeneratedBullets: number;
    totalDailyLogs: number;
    estimatedAiCostUsd: number;
  }>;
  userSummaries: AdminUserSummary[];
};

type ParsedUserData = {
  settings: Record<string, unknown> | null;
  history: Array<Record<string, unknown>>;
  log: Array<Record<string, unknown>>;
  latestUpdatedAt: string | null;
};

const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function asNumber(value: unknown) {
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.max(0, Math.round(n));
}

function asDecimal(value: unknown) {
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.max(0, Math.round(n * 1_000_000) / 1_000_000);
}

function toIso(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function monthKeyFromDate(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildRecentMonths(count: number) {
  const now = new Date();
  const months: string[] = [];

  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(monthKeyFromDate(date));
  }

  return months;
}

function maskIdentifier(email: string | null, username: string) {
  if (email && email.includes("@")) {
    const [local, domain] = email.split("@");
    const safeLocal = local.length <= 2 ? `${local.slice(0, 1)}*` : `${local.slice(0, 2)}***`;
    return `${safeLocal}@${domain}`;
  }

  if (username.length <= 2) {
    return `${username.slice(0, 1)}*`;
  }

  return `${username.slice(0, 2)}***`;
}

function parseJsonArray(value: string): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
    }
  } catch {
    return [];
  }

  return [];
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function getItemMonth(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return monthKeyFromDate(parsed);
}

export async function getAdminAnalyticsSnapshot(options?: { maskEmails?: boolean }) {
  await ensureSchema();

  const maskEmails = options?.maskEmails ?? true;
  const now = Date.now();
  const activeCutoff = now - ACTIVE_WINDOW_MS;
  const monthKeys = buildRecentMonths(12);

  const [usersResult, userDataResult, aiAggResult, aiLogResult] = await Promise.all([
    sql`SELECT id, username, email, created_at, last_login_at, plan_status FROM users`,
    sql`
      SELECT user_id, data_key, data_value, updated_at
      FROM user_data
      WHERE data_key IN ('settings', 'history', 'log')
    `,
    sql`
      SELECT
        user_id,
        COUNT(*)::INT AS total_ai_calls,
        COALESCE(SUM(prompt_tokens), 0)::INT AS total_prompt_tokens,
        COALESCE(SUM(completion_tokens), 0)::INT AS total_completion_tokens,
        COALESCE(SUM(total_tokens), 0)::INT AS total_tokens,
        COALESCE(SUM(estimated_cost_usd), 0)::NUMERIC AS estimated_ai_cost_usd,
        COALESCE(SUM(CASE WHEN endpoint = '/api/generate' AND success THEN 1 ELSE 0 END), 0)::INT AS generated_bullets,
        COALESCE(SUM(document_upload_count), 0)::INT AS document_upload_count,
        COALESCE(SUM(document_reference_count), 0)::INT AS document_reference_count,
        COALESCE(SUM(retrieval_call_count), 0)::INT AS retrieval_call_count,
        COALESCE(SUM(doc_context_prompt_tokens), 0)::INT AS doc_context_prompt_tokens,
        MAX(created_at)::TEXT AS last_ai_at
      FROM ai_usage_logs
      GROUP BY user_id
    `,
    sql`
      SELECT user_id, endpoint, total_tokens, estimated_cost_usd, created_at, success
      FROM ai_usage_logs
      WHERE created_at >= NOW() - INTERVAL '18 months'
    `,
  ]);

  const users = usersResult.rows as unknown as UserRow[];
  const userDataRows = userDataResult.rows as unknown as UserDataRow[];
  const aiAggRows = aiAggResult.rows as unknown as UserAiAggregateRow[];
  const aiLogRows = aiLogResult.rows as unknown as AiLogRow[];

  const userDataMap = new Map<string, ParsedUserData>();
  for (const row of userDataRows) {
    const current = userDataMap.get(row.user_id) ?? {
      settings: null,
      history: [],
      log: [],
      latestUpdatedAt: null,
    };

    if (row.data_key === "settings") {
      current.settings = parseJsonObject(row.data_value);
    }

    if (row.data_key === "history") {
      current.history = parseJsonArray(row.data_value);
    }

    if (row.data_key === "log") {
      current.log = parseJsonArray(row.data_value);
    }

    const rowUpdatedAt = toIso(row.updated_at);
    const existingUpdatedAt = toIso(current.latestUpdatedAt);
    if (rowUpdatedAt && (!existingUpdatedAt || rowUpdatedAt > existingUpdatedAt)) {
      current.latestUpdatedAt = rowUpdatedAt;
    }

    userDataMap.set(row.user_id, current);
  }

  const aiAggMap = new Map<string, UserAiAggregateRow>();
  for (const row of aiAggRows) {
    aiAggMap.set(row.user_id, row);
  }

  const monthly = new Map<
    string,
    {
      newUsers: number;
      activeUsers: Set<string>;
      bulletsGenerated: number;
      committedMarks: number;
      aiCalls: number;
      totalTokens: number;
      estimatedCostUsd: number;
    }
  >();

  for (const month of monthKeys) {
    monthly.set(month, {
      newUsers: 0,
      activeUsers: new Set<string>(),
      bulletsGenerated: 0,
      committedMarks: 0,
      aiCalls: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    });
  }

  for (const row of aiLogRows) {
    const month = getItemMonth(row.created_at);
    if (!month || !monthly.has(month)) {
      continue;
    }

    const bucket = monthly.get(month);
    if (!bucket) {
      continue;
    }

    bucket.aiCalls += 1;
    bucket.totalTokens += asNumber(row.total_tokens);
    bucket.estimatedCostUsd = asDecimal(bucket.estimatedCostUsd + asDecimal(row.estimated_cost_usd));
    bucket.activeUsers.add(row.user_id);

    if (row.endpoint === "/api/generate" && row.success) {
      bucket.bulletsGenerated += 1;
    }

  }

  const userSummaries: AdminUserSummary[] = [];

  for (const user of users) {
    const userData = userDataMap.get(user.id);
    const aiAgg = aiAggMap.get(user.id);

    const rank =
      typeof userData?.settings?.rankLevel === "string" && userData.settings.rankLevel.trim()
        ? userData.settings.rankLevel.trim()
        : "Unknown";
    const rate =
      typeof userData?.settings?.rating === "string" && userData.settings.rating.trim()
        ? userData.settings.rating.trim()
        : "Unknown";

    const logEntries = Array.isArray(userData?.log) ? userData.log : [];
    const historyEntries = Array.isArray(userData?.history) ? userData.history : [];

    const lastLoginAt = toIso(user.last_login_at);
    const lastAiAt = toIso(aiAgg?.last_ai_at ?? null);
    const latestUserDataUpdateAt = toIso(userData?.latestUpdatedAt ?? null);

    const lastActiveDate = [lastLoginAt, lastAiAt, latestUserDataUpdateAt]
      .filter((value): value is string => typeof value === "string")
      .sort()
      .at(-1) ?? null;

    const isActive = !!lastActiveDate && new Date(lastActiveDate).getTime() >= activeCutoff;

    const totalDailyLogs = logEntries.length;
    const totalCommittedMarks = historyEntries.length;
    const aiGeneratedBullets = asNumber(aiAgg?.generated_bullets);
    const totalGeneratedBullets = Math.max(aiGeneratedBullets, totalCommittedMarks);
    const totalAiCalls = asNumber(aiAgg?.total_ai_calls);
    const totalPromptTokens = asNumber(aiAgg?.total_prompt_tokens);
    const totalCompletionTokens = asNumber(aiAgg?.total_completion_tokens);
    const totalTokens = asNumber(aiAgg?.total_tokens);
    const estimatedAiCostUsd = asDecimal(aiAgg?.estimated_ai_cost_usd);

    const summary: AdminUserSummary = {
      userId: user.id,
      identifier: maskEmails ? maskIdentifier(user.email, user.username) : user.email ?? user.username,
      rank,
      rate,
      dateJoined: toIso(user.created_at) ?? user.created_at,
      activeStatus: isActive ? "Active" : "Inactive",
      lastActiveDate,
      totalDailyLogs,
      totalGeneratedBullets,
      totalCommittedMarks,
      totalAiCalls,
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens,
      estimatedAiCostUsd,
      averageCostPerMarkUsd: computeAverageCostPerMark(estimatedAiCostUsd, totalCommittedMarks),
    };

    userSummaries.push(summary);

    const userCreatedMonth = getItemMonth(user.created_at);
    if (userCreatedMonth && monthly.has(userCreatedMonth)) {
      const bucket = monthly.get(userCreatedMonth);
      if (bucket) {
        bucket.newUsers += 1;
      }
    }

    if (lastLoginAt) {
      const loginMonth = getItemMonth(lastLoginAt);
      if (loginMonth && monthly.has(loginMonth)) {
        monthly.get(loginMonth)?.activeUsers.add(user.id);
      }
    }

    for (const entry of logEntries) {
      const month = getItemMonth(entry.date);
      if (!month || !monthly.has(month)) {
        continue;
      }
      monthly.get(month)?.activeUsers.add(user.id);
    }

    for (const item of historyEntries) {
      const month = getItemMonth(item.date);
      if (!month || !monthly.has(month)) {
        continue;
      }
      const bucket = monthly.get(month);
      if (!bucket) {
        continue;
      }
      bucket.committedMarks += 1;
      bucket.activeUsers.add(user.id);
    }

    await sql`
      INSERT INTO user_metrics (
        user_id,
        rank,
        rate,
        date_joined,
        is_active,
        last_active_at,
        total_daily_logs,
        total_generated_bullets,
        total_committed_marks,
        total_ai_calls,
        total_prompt_tokens,
        total_completion_tokens,
        total_tokens,
        estimated_ai_cost_usd,
        document_upload_count,
        document_reference_count,
        retrieval_call_count,
        doc_context_prompt_tokens,
        updated_at
      )
      VALUES (
        ${user.id},
        ${rank},
        ${rate},
        ${toIso(user.created_at) ?? user.created_at},
        ${isActive},
        ${lastActiveDate},
        ${totalDailyLogs},
        ${totalGeneratedBullets},
        ${totalCommittedMarks},
        ${totalAiCalls},
        ${totalPromptTokens},
        ${totalCompletionTokens},
        ${totalTokens},
        ${estimatedAiCostUsd},
        ${asNumber(aiAgg?.document_upload_count)},
        ${asNumber(aiAgg?.document_reference_count)},
        ${asNumber(aiAgg?.retrieval_call_count)},
        ${asNumber(aiAgg?.doc_context_prompt_tokens)},
        NOW()
      )
      ON CONFLICT (user_id) DO UPDATE
      SET
        rank = EXCLUDED.rank,
        rate = EXCLUDED.rate,
        date_joined = EXCLUDED.date_joined,
        is_active = EXCLUDED.is_active,
        last_active_at = EXCLUDED.last_active_at,
        total_daily_logs = EXCLUDED.total_daily_logs,
        total_generated_bullets = EXCLUDED.total_generated_bullets,
        total_committed_marks = EXCLUDED.total_committed_marks,
        total_ai_calls = EXCLUDED.total_ai_calls,
        total_prompt_tokens = EXCLUDED.total_prompt_tokens,
        total_completion_tokens = EXCLUDED.total_completion_tokens,
        total_tokens = EXCLUDED.total_tokens,
        estimated_ai_cost_usd = EXCLUDED.estimated_ai_cost_usd,
        document_upload_count = EXCLUDED.document_upload_count,
        document_reference_count = EXCLUDED.document_reference_count,
        retrieval_call_count = EXCLUDED.retrieval_call_count,
        doc_context_prompt_tokens = EXCLUDED.doc_context_prompt_tokens,
        updated_at = NOW()
    `;
  }

  for (const month of monthKeys) {
    const bucket = monthly.get(month);
    if (!bucket) {
      continue;
    }

    await sql`
      INSERT INTO monthly_metrics (
        user_id,
        month,
        new_users,
        active_users,
        bullets_generated,
        committed_marks,
        ai_calls,
        total_tokens,
        estimated_cost_usd,
        updated_at
      )
      VALUES (
        ${"__all__"},
        ${month},
        ${bucket.newUsers},
        ${bucket.activeUsers.size},
        ${bucket.bulletsGenerated},
        ${bucket.committedMarks},
        ${bucket.aiCalls},
        ${bucket.totalTokens},
        ${asDecimal(bucket.estimatedCostUsd)},
        NOW()
      )
      ON CONFLICT (user_id, month) DO UPDATE
      SET
        new_users = EXCLUDED.new_users,
        active_users = EXCLUDED.active_users,
        bullets_generated = EXCLUDED.bullets_generated,
        committed_marks = EXCLUDED.committed_marks,
        ai_calls = EXCLUDED.ai_calls,
        total_tokens = EXCLUDED.total_tokens,
        estimated_cost_usd = EXCLUDED.estimated_cost_usd,
        updated_at = NOW()
    `;
  }

  const totalUsers = userSummaries.length;
  const activeUsers = userSummaries.filter((item) => item.activeStatus === "Active").length;
  const totalBulletsGenerated = userSummaries.reduce((sum, item) => sum + item.totalGeneratedBullets, 0);
  const totalCommittedMarks = userSummaries.reduce((sum, item) => sum + item.totalCommittedMarks, 0);
  const totalAiCalls = userSummaries.reduce((sum, item) => sum + item.totalAiCalls, 0);
  const totalTokenUsage = userSummaries.reduce((sum, item) => sum + item.totalTokens, 0);
  const estimatedTotalAiCostUsd = sumEstimatedCostUsd(
    userSummaries.map((item) => item.estimatedAiCostUsd)
  );

  const averageBulletsPerUser = totalUsers > 0 ? totalBulletsGenerated / totalUsers : 0;
  const averageAiCallsPerUser = totalUsers > 0 ? totalAiCalls / totalUsers : 0;
  const averageTokensPerUser = totalUsers > 0 ? totalTokenUsage / totalUsers : 0;
  const estimatedAverageCostPerUserUsd = totalUsers > 0 ? estimatedTotalAiCostUsd / totalUsers : 0;

  const rankRateMap = new Map<string, { rank: string; rate: string; users: number; costTotal: number }>();
  for (const user of userSummaries) {
    const key = `${user.rank}::${user.rate}`;
    const existing = rankRateMap.get(key) ?? {
      rank: user.rank,
      rate: user.rate,
      users: 0,
      costTotal: 0,
    };

    existing.users += 1;
    existing.costTotal += user.estimatedAiCostUsd;
    rankRateMap.set(key, existing);
  }

  const usersByRankRate = Array.from(rankRateMap.values())
    .map((item) => ({ rank: item.rank, rate: item.rate, users: item.users }))
    .sort((left, right) => right.users - left.users);

  const averageCostByRankRate = Array.from(rankRateMap.values())
    .map((item) => ({
      rank: item.rank,
      rate: item.rate,
      averageCostUsd: item.users > 0 ? asDecimal(item.costTotal / item.users) : 0,
    }))
    .sort((left, right) => right.averageCostUsd - left.averageCostUsd);

  const mostActiveUsers = [...userSummaries]
    .sort((left, right) => {
      const leftScore = left.totalAiCalls + left.totalGeneratedBullets + left.totalDailyLogs;
      const rightScore = right.totalAiCalls + right.totalGeneratedBullets + right.totalDailyLogs;
      return rightScore - leftScore;
    })
    .slice(0, 10)
    .map((item) => ({
      userId: item.userId,
      identifier: item.identifier,
      rank: item.rank,
      rate: item.rate,
      totalAiCalls: item.totalAiCalls,
      totalGeneratedBullets: item.totalGeneratedBullets,
      totalDailyLogs: item.totalDailyLogs,
      estimatedAiCostUsd: item.estimatedAiCostUsd,
    }));

  const monthlyTrends = monthKeys.map((month) => {
    const bucket = monthly.get(month);
    return {
      month,
      newUsers: bucket?.newUsers ?? 0,
      activeUsers: bucket?.activeUsers.size ?? 0,
      bulletsGenerated: bucket?.bulletsGenerated ?? 0,
      committedMarks: bucket?.committedMarks ?? 0,
      aiCalls: bucket?.aiCalls ?? 0,
      totalTokens: bucket?.totalTokens ?? 0,
      estimatedCostUsd: asDecimal(bucket?.estimatedCostUsd ?? 0),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      totalUsers,
      activeUsers,
      totalBulletsGenerated,
      totalCommittedMarks,
      averageBulletsPerUser: asDecimal(averageBulletsPerUser),
      averageAiCallsPerUser: asDecimal(averageAiCallsPerUser),
      averageTokensPerUser: asDecimal(averageTokensPerUser),
      totalTokenUsage,
      estimatedTotalAiCostUsd,
      estimatedAverageCostPerUserUsd: asDecimal(estimatedAverageCostPerUserUsd),
      averageCostPerActiveUserUsd: computeAverageCostPerActiveUser(estimatedTotalAiCostUsd, activeUsers),
    },
    usersByRankRate,
    averageCostByRankRate,
    monthlyTrends,
    mostActiveUsers,
    userSummaries,
  } as AdminAnalyticsSnapshot;
}
