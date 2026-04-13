import { createHmac, randomBytes } from "node:crypto";
import { ensureSchema, sql } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import {
  findUserByEmail,
  findUserById,
  sanitizeEmail,
  updateUserPasswordHashById,
} from "@/lib/userStore";
import { sendWithSendGrid } from "@/lib/sendgrid";

const RESET_TOKEN_TTL_MINUTES = 20;
const GENERIC_FORGOT_PASSWORD_MESSAGE =
  "If an account with that email exists, a password reset link has been sent.";

function getResetTokenSecret() {
  if (process.env.PASSWORD_RESET_SECRET) {
    return process.env.PASSWORD_RESET_SECRET;
  }

  if (process.env.AUTH_SECRET) {
    return process.env.AUTH_SECRET;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Server misconfiguration: PASSWORD_RESET_SECRET or AUTH_SECRET is not set.");
  }

  return "dev-only-password-reset-token-secret";
}

function hashResetToken(token: string) {
  return createHmac("sha256", getResetTokenSecret()).update(token).digest("hex");
}

function generateResetToken() {
  return randomBytes(32).toString("hex");
}

function getResetEmailSubject() {
  return "Reset your Bullet Proof password";
}

function getAppBaseUrl() {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Server misconfiguration: APP_BASE_URL is not set.");
  }

  return "http://localhost:3000";
}

function buildResetLink(token: string) {
  return `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

function getResetEmailBody(link: string) {
  return [
    "You requested a password reset for your Bullet Proof account.",
    "",
    `Reset link: ${link}`,
    `This link expires in ${RESET_TOKEN_TTL_MINUTES} minutes.`,
    "",
    "If you did not request this reset, you can ignore this email.",
  ].join("\n");
}

function getResetEmailHtml(link: string) {
  return [
    "<p>You requested a password reset for your Bullet Proof account.</p>",
    `<p><a href=\"${link}\">Reset Password</a></p>`,
    `<p>This link expires in ${RESET_TOKEN_TTL_MINUTES} minutes.</p>`,
    "<p>If you did not request this reset, you can ignore this email.</p>",
  ].join("");
}

async function sendResetEmail(email: string, token: string) {
  const resetLink = buildResetLink(token);
  const fromEmail = process.env.EMAIL_FROM?.trim();
  const sendGridApiKey = process.env.SENDGRID_API_KEY?.trim();

  if (!fromEmail || !sendGridApiKey) {
    if (process.env.NODE_ENV === "production") {
      if (!fromEmail) {
        throw new Error("Server misconfiguration: EMAIL_FROM is not set.");
      }
      throw new Error("Server misconfiguration: SENDGRID_API_KEY is not set.");
    }

    // Local dev fallback: keep the reset flow testable without SendGrid.
    console.warn(
      "Password reset email transport is not configured (missing EMAIL_FROM or SENDGRID_API_KEY)."
    );
    console.info(`Password reset link for ${email}: ${resetLink}`);
    return;
  }

  await sendWithSendGrid({
    from: fromEmail,
    to: email,
    subject: getResetEmailSubject(),
    text: getResetEmailBody(resetLink),
    html: getResetEmailHtml(resetLink),
  });
}

async function clearExpiredResetTokens() {
  await sql`
    DELETE FROM password_reset_tokens
    WHERE expires_at <= NOW() OR consumed_at IS NOT NULL
  `;
}

export function getForgotPasswordSuccessMessage() {
  return GENERIC_FORGOT_PASSWORD_MESSAGE;
}

export async function requestPasswordResetByEmail(emailInput: string): Promise<void> {
  const email = sanitizeEmail(emailInput);
  if (!email) {
    return;
  }

  const user = await findUserByEmail(email);
  if (!user || !user.emailLower || !user.email) {
    return;
  }

  await ensureSchema();
  await clearExpiredResetTokens();

  const token = generateResetToken();
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000).toISOString();
  const createdAt = new Date().toISOString();

  await sql`
    DELETE FROM password_reset_tokens
    WHERE user_id = ${user.id} OR expires_at <= NOW()
  `;

  await sql`
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at)
    VALUES (${user.id}, ${tokenHash}, ${expiresAt}, ${createdAt})
  `;

  await sendResetEmail(user.email, token);
}

export async function validatePasswordResetToken(tokenInput: string): Promise<{
  success: true;
} | {
  success: false;
  error: string;
  status: number;
}> {
  const token = (tokenInput || "").trim();
  if (!token) {
    return {
      success: false,
      error: "Reset token is required.",
      status: 400,
    };
  }

  await ensureSchema();
  await clearExpiredResetTokens();

  const tokenHash = hashResetToken(token);
  const result = await sql`
    SELECT id, expires_at, consumed_at
    FROM password_reset_tokens
    WHERE token_hash = ${tokenHash}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (result.rows.length === 0) {
    return {
      success: false,
      error: "Reset link is invalid or expired.",
      status: 400,
    };
  }

  const row = result.rows[0];
  const expiresAt = row.expires_at as string;
  const consumedAt = row.consumed_at as string | null;

  if (consumedAt || !expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
    return {
      success: false,
      error: "Reset link is invalid or expired.",
      status: 400,
    };
  }

  return { success: true };
}

export async function resetPasswordWithToken(input: {
  token: string;
  newPassword: string;
}): Promise<{ success: true } | { success: false; error: string; status: number }> {
  const token = (input.token || "").trim();
  const newPassword = (input.newPassword || "").trim();

  if (!token || !newPassword) {
    return {
      success: false,
      error: "Reset token and new password are required.",
      status: 400,
    };
  }

  if (newPassword.length < 8 || newPassword.length > 128) {
    return {
      success: false,
      error: "Password must be 8-128 characters.",
      status: 400,
    };
  }

  await ensureSchema();
  await clearExpiredResetTokens();

  const tokenHash = hashResetToken(token);
  const result = await sql`
    SELECT id, user_id, expires_at, consumed_at
    FROM password_reset_tokens
    WHERE token_hash = ${tokenHash}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (result.rows.length === 0) {
    return {
      success: false,
      error: "Reset link is invalid or expired.",
      status: 400,
    };
  }

  const row = result.rows[0];
  const resetId = row.id as number;
  const userId = row.user_id as string;
  const expiresAt = row.expires_at as string;
  const consumedAt = row.consumed_at as string | null;

  if (consumedAt || !expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
    return {
      success: false,
      error: "Reset link is invalid or expired.",
      status: 400,
    };
  }

  const user = await findUserById(userId);
  if (!user) {
    return {
      success: false,
      error: "Reset link is invalid or expired.",
      status: 400,
    };
  }

  const nextHash = await hashPassword(newPassword);
  await updateUserPasswordHashById(user.id, nextHash);

  await sql`
    UPDATE password_reset_tokens
    SET consumed_at = NOW()
    WHERE id = ${resetId}
  `;

  await sql`
    DELETE FROM password_reset_tokens
    WHERE user_id = ${user.id} AND id <> ${resetId}
  `;

  return { success: true };
}
