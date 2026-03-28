import { randomUUID } from "node:crypto";
import { sql, ensureSchema } from "./db";

export type UserRecord = {
  id: string;
  username: string;
  usernameLower: string;
  email: string | null;
  emailLower: string | null;
  passwordHash: string;
  createdAt: string;
  hasCompletedTutorial: boolean;
  lastLoginAt: string | null;
  planTier: "free" | "premium";
  planStatus: "trialing" | "active" | "past_due" | "canceled" | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionCurrentPeriodEnd: string | null;
  betaTrialExpiresAt: string | null;
  betaTrialRedeemedAt: string | null;
  dailyUsageCount: number;
  lastUsageResetDate: string | null;
  updatedAt: string | null;
};

export function sanitizeUsername(username: string) {
  return username.trim();
}

export function toUsernameLower(username: string) {
  return sanitizeUsername(username).toLowerCase();
}

export function sanitizeEmail(email: string) {
  return email.trim();
}

export function toEmailLower(email: string) {
  return sanitizeEmail(email).toLowerCase();
}

export function isValidEmail(email: string) {
  const normalized = sanitizeEmail(email);
  if (normalized.length < 3 || normalized.length > 254) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function rowToUser(row: Record<string, unknown>): UserRecord {
  const rawLastLoginAt = row.last_login_at;
  const rawPlanTier = row.plan_tier;
  const rawPlanStatus = row.plan_status;
  const rawStripeCustomerId = row.stripe_customer_id;
  const rawStripeSubscriptionId = row.stripe_subscription_id;
  const rawSubscriptionCurrentPeriodEnd = row.subscription_current_period_end;
  const rawBetaTrialExpiresAt = row.beta_trial_expires_at;
  const rawBetaTrialRedeemedAt = row.beta_trial_redeemed_at;
  const rawDailyUsageCount = row.daily_usage_count;
  const rawLastUsageResetDate = row.last_usage_reset_date;
  const rawUpdatedAt = row.updated_at;
  const normalizedPlanTier =
    typeof rawPlanTier === "string" && rawPlanTier.toLowerCase() === "premium"
      ? "premium"
      : "free";
  let normalizedPlanStatus: "trialing" | "active" | "past_due" | "canceled" | null = null;
  if (typeof rawPlanStatus === "string") {
    const candidate = rawPlanStatus.trim().toLowerCase();
    if (
      candidate === "trialing" ||
      candidate === "active" ||
      candidate === "past_due" ||
      candidate === "canceled"
    ) {
      normalizedPlanStatus = candidate;
    }
  }

  return {
    id: row.id as string,
    username: row.username as string,
    usernameLower: row.username_lower as string,
    email: typeof row.email === "string" ? row.email : null,
    emailLower: typeof row.email_lower === "string" ? row.email_lower : null,
    passwordHash: row.password_hash as string,
    createdAt: row.created_at as string,
    hasCompletedTutorial: row.has_completed_tutorial as boolean,
    lastLoginAt: typeof rawLastLoginAt === "string" ? rawLastLoginAt : null,
    planTier: normalizedPlanTier,
    planStatus: normalizedPlanStatus,
    stripeCustomerId: typeof rawStripeCustomerId === "string" ? rawStripeCustomerId : null,
    stripeSubscriptionId:
      typeof rawStripeSubscriptionId === "string" ? rawStripeSubscriptionId : null,
    subscriptionCurrentPeriodEnd:
      typeof rawSubscriptionCurrentPeriodEnd === "string"
        ? rawSubscriptionCurrentPeriodEnd
        : null,
    betaTrialExpiresAt:
      typeof rawBetaTrialExpiresAt === "string" ? rawBetaTrialExpiresAt : null,
    betaTrialRedeemedAt:
      typeof rawBetaTrialRedeemedAt === "string" ? rawBetaTrialRedeemedAt : null,
    dailyUsageCount:
      typeof rawDailyUsageCount === "number"
        ? Math.max(0, Math.floor(rawDailyUsageCount))
        : typeof rawDailyUsageCount === "string"
          ? Math.max(0, Math.floor(Number(rawDailyUsageCount) || 0))
          : 0,
    lastUsageResetDate:
      typeof rawLastUsageResetDate === "string" ? rawLastUsageResetDate : null,
    updatedAt: typeof rawUpdatedAt === "string" ? rawUpdatedAt : null,
  };
}

export async function findUserByUsername(username: string): Promise<UserRecord | null> {
  await ensureSchema();
  const usernameLower = toUsernameLower(username);
  const result = await sql`SELECT * FROM users WHERE username_lower = ${usernameLower}`;
  return result.rows.length > 0 ? rowToUser(result.rows[0]) : null;
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  await ensureSchema();
  const emailLower = toEmailLower(email);
  const result = await sql`SELECT * FROM users WHERE email_lower = ${emailLower}`;
  return result.rows.length > 0 ? rowToUser(result.rows[0]) : null;
}

export async function findUserByUsernameOrEmail(identifier: string): Promise<UserRecord | null> {
  const normalized = identifier.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.includes("@")) {
    const byEmail = await findUserByEmail(normalized);
    if (byEmail) {
      return byEmail;
    }
  }

  return findUserByUsername(normalized);
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  await ensureSchema();
  const result = await sql`SELECT * FROM users WHERE id = ${id}`;
  return result.rows.length > 0 ? rowToUser(result.rows[0]) : null;
}

export async function createUser(input: {
  username: string;
  passwordHash: string;
  email?: string;
}): Promise<UserRecord> {
  await ensureSchema();
  const username = sanitizeUsername(input.username);
  const usernameLower = toUsernameLower(username);
  const email = sanitizeEmail(input.email ?? "");
  const emailLower = email ? toEmailLower(email) : null;

  const existing = await sql`SELECT id FROM users WHERE username_lower = ${usernameLower}`;
  if (existing.rows.length > 0) {
    throw new Error("USER_EXISTS");
  }

  if (emailLower) {
    const existingEmail = await sql`SELECT id FROM users WHERE email_lower = ${emailLower}`;
    if (existingEmail.rows.length > 0) {
      throw new Error("EMAIL_EXISTS");
    }
  }

  const id = randomUUID();
  const createdAt = new Date().toISOString();

  await sql`
    INSERT INTO users (id, username, username_lower, email, email_lower, password_hash, created_at, has_completed_tutorial)
    VALUES (${id}, ${username}, ${usernameLower}, ${email || null}, ${emailLower}, ${input.passwordHash}, ${createdAt}, FALSE)
  `;

  return {
    id,
    username,
    usernameLower,
    email: email || null,
    emailLower,
    passwordHash: input.passwordHash,
    createdAt,
    hasCompletedTutorial: false,
    lastLoginAt: null,
    planTier: "free",
    planStatus: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionCurrentPeriodEnd: null,
    betaTrialExpiresAt: null,
    betaTrialRedeemedAt: null,
    dailyUsageCount: 0,
    lastUsageResetDate: createdAt.slice(0, 10),
    updatedAt: createdAt,
  };
}

export async function updateUserStripeCustomerIdById(
  id: string,
  stripeCustomerId: string
): Promise<void> {
  await ensureSchema();
  await sql`
    UPDATE users
    SET stripe_customer_id = ${stripeCustomerId}, updated_at = NOW()
    WHERE id = ${id}
  `;
}

export async function updateUserSubscriptionByStripeCustomerId(input: {
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  planTier: "free" | "premium";
  planStatus: "trialing" | "active" | "past_due" | "canceled" | null;
  subscriptionCurrentPeriodEnd: string | null;
}): Promise<void> {
  await ensureSchema();
  await sql`
    UPDATE users
    SET
      stripe_subscription_id = ${input.stripeSubscriptionId},
      plan_tier = ${input.planTier},
      plan_status = ${input.planStatus},
      subscription_current_period_end = ${input.subscriptionCurrentPeriodEnd},
      updated_at = NOW()
    WHERE stripe_customer_id = ${input.stripeCustomerId}
  `;
}

export async function redeemBetaTrialByUserId(input: {
  userId: string;
  durationDays?: number;
}): Promise<{ granted: boolean; expiresAt: string | null }> {
  await ensureSchema();
  const durationDays =
    typeof input.durationDays === "number" && Number.isFinite(input.durationDays)
      ? Math.max(1, Math.floor(input.durationDays))
      : 14;

  const expiresAtDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  await sql`
    UPDATE users
    SET
      beta_trial_expires_at = ${expiresAtDate},
      beta_trial_redeemed_at = NOW(),
      updated_at = NOW()
    WHERE id = ${input.userId}
  `;

  return {
    granted: true,
    expiresAt: expiresAtDate,
  };
}

export async function enablePremiumAiSettingsByStripeCustomerId(stripeCustomerId: string): Promise<void> {
  await ensureSchema();

  // Get the user by stripe customer ID
  const userResult = await sql`
    SELECT id FROM users WHERE stripe_customer_id = ${stripeCustomerId} LIMIT 1
  `;

  if (userResult.rows.length === 0) {
    return;
  }

  const userId = (userResult.rows[0].id as string) ?? null;
  if (!userId) {
    return;
  }

  // Get existing settings
  const existingResult = await sql`
    SELECT data_value FROM user_data WHERE user_id = ${userId} AND data_key = 'settings' LIMIT 1
  `;

  let settings: Record<string, unknown> = {};
  if (existingResult.rows.length > 0) {
    try {
      const parsed = JSON.parse((existingResult.rows[0].data_value as string) ?? "{}");
      settings = typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      settings = {};
    }
  }

  // Enable all AI settings
  const updatedSettings = {
    ...settings,
    aiGeneratorEnabled: true,
    aiGeneratorSplitRecommendationsEnabled: true,
    aiGeneratorAlternateDraftsEnabled: true,
    aiLogImportEnabled: true,
    aiDashboardInsightsEnabled: true,
    aiMarksPackageEnabled: true,
  };

  const settingsJson = JSON.stringify(updatedSettings);

  // Upsert settings into user_data
  await sql`
    INSERT INTO user_data (user_id, data_key, data_value)
    VALUES (${userId}, 'settings', ${settingsJson})
    ON CONFLICT (user_id, data_key) DO UPDATE SET
      data_value = ${settingsJson},
      updated_at = NOW()
  `;
}

export async function markTutorialCompleted(id: string): Promise<UserRecord | null> {
  await ensureSchema();
  await sql`UPDATE users SET has_completed_tutorial = TRUE WHERE id = ${id}`;
  return findUserById(id);
}

export async function deleteUserById(id: string): Promise<void> {
  await ensureSchema();
  // CASCADE in user_data FK deletes all user data rows automatically.
  await sql`DELETE FROM users WHERE id = ${id}`;
}

export async function updateUserLastLoginById(id: string): Promise<void> {
  await ensureSchema();
  const lastLoginAt = new Date().toISOString();
  await sql`
    UPDATE users
    SET last_login_at = ${lastLoginAt}, updated_at = NOW()
    WHERE id = ${id}
  `;
}

export async function updateUserEmailById(id: string, email: string): Promise<UserRecord | null> {
  await ensureSchema();
  const sanitizedEmail = sanitizeEmail(email);
  const emailLower = toEmailLower(sanitizedEmail);

  await sql`
    UPDATE users
    SET email = ${sanitizedEmail}, email_lower = ${emailLower}, updated_at = NOW()
    WHERE id = ${id}
  `;

  return findUserById(id);
}

export async function updateUserPasswordHashById(id: string, passwordHash: string): Promise<void> {
  await ensureSchema();
  await sql`
    UPDATE users
    SET password_hash = ${passwordHash}, updated_at = NOW()
    WHERE id = ${id}
  `;
}
