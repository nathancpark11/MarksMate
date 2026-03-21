import { createHmac, randomInt } from "node:crypto";
import { ensureSchema, sql } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { findUserByUsernameOrEmail, sanitizeUsername, updateUserPasswordHashById } from "@/lib/userStore";

const RESET_CODE_TTL_MINUTES = 15;

function getResetCodeSecret() {
  if (process.env.PASSWORD_RESET_SECRET) {
    return process.env.PASSWORD_RESET_SECRET;
  }

  if (process.env.AUTH_SECRET) {
    return process.env.AUTH_SECRET;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Server misconfiguration: PASSWORD_RESET_SECRET or AUTH_SECRET is not set.");
  }

  return "dev-only-password-reset-secret";
}

function hashResetCode(code: string) {
  return createHmac("sha256", getResetCodeSecret()).update(code).digest("hex");
}

function generateResetCode() {
  return randomInt(100000, 1000000).toString();
}

function getResetEmailSubject() {
  return "Your Bullet Proof password reset code";
}

function getResetEmailBody(code: string) {
  return [
    "You requested a password reset for your Bullet Proof account.",
    "",
    `Verification code: ${code}`,
    `This code expires in ${RESET_CODE_TTL_MINUTES} minutes.`,
    "",
    "If you did not request this reset, you can ignore this email.",
  ].join("\n");
}

async function sendResetEmail(email: string, code: string) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.PASSWORD_RESET_FROM_EMAIL || process.env.EMAIL_FROM;

  if (!resendApiKey || !fromEmail) {
    if (process.env.NODE_ENV !== "production") {
      console.info("password-reset dev fallback", { email, code });
      return;
    }

    throw new Error("Email provider is not configured. Set RESEND_API_KEY and PASSWORD_RESET_FROM_EMAIL.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      subject: getResetEmailSubject(),
      text: getResetEmailBody(code),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send reset email (${response.status}): ${errorText.slice(0, 300)}`);
  }
}

export async function issuePasswordResetCode(identifier: string): Promise<void> {
  const normalizedIdentifier = sanitizeUsername(identifier);
  if (!normalizedIdentifier) {
    return;
  }

  const user = await findUserByUsernameOrEmail(normalizedIdentifier);
  if (!user || !user.emailLower || !user.email) {
    return;
  }

  await ensureSchema();

  const code = generateResetCode();
  const codeHash = hashResetCode(code);
  const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000).toISOString();
  const createdAt = new Date().toISOString();

  await sql`
    DELETE FROM password_reset_codes
    WHERE user_id = ${user.id} OR expires_at <= NOW()
  `;

  await sql`
    INSERT INTO password_reset_codes (user_id, code_hash, expires_at, created_at)
    VALUES (${user.id}, ${codeHash}, ${expiresAt}, ${createdAt})
  `;

  await sendResetEmail(user.email, code);
}

export async function resetPasswordWithCode(input: {
  identifier: string;
  code: string;
  newPassword: string;
}): Promise<{ success: true } | { success: false; error: string; status: number }> {
  const identifier = sanitizeUsername(input.identifier);
  const code = (input.code || "").trim();
  const newPassword = (input.newPassword || "").trim();

  if (!identifier || !code || !newPassword) {
    return {
      success: false,
      error: "Identifier, verification code, and new password are required.",
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

  const user = await findUserByUsernameOrEmail(identifier);
  if (!user || !user.emailLower) {
    return {
      success: false,
      error: "Invalid verification code or account.",
      status: 400,
    };
  }

  await ensureSchema();

  const result = await sql`
    SELECT id, code_hash, expires_at, consumed_at
    FROM password_reset_codes
    WHERE user_id = ${user.id}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (result.rows.length === 0) {
    return {
      success: false,
      error: "Invalid verification code or account.",
      status: 400,
    };
  }

  const row = result.rows[0];
  const resetId = row.id as number;
  const storedHash = row.code_hash as string;
  const expiresAt = row.expires_at as string;
  const consumedAt = row.consumed_at as string | null;

  if (consumedAt) {
    return {
      success: false,
      error: "Verification code has already been used.",
      status: 400,
    };
  }

  if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
    return {
      success: false,
      error: "Verification code has expired.",
      status: 400,
    };
  }

  const incomingHash = hashResetCode(code);
  if (incomingHash !== storedHash) {
    return {
      success: false,
      error: "Invalid verification code or account.",
      status: 400,
    };
  }

  const nextHash = await hashPassword(newPassword);
  await updateUserPasswordHashById(user.id, nextHash);

  await sql`
    UPDATE password_reset_codes
    SET consumed_at = NOW()
    WHERE id = ${resetId}
  `;

  await sql`
    DELETE FROM password_reset_codes
    WHERE user_id = ${user.id} AND id <> ${resetId}
  `;

  return { success: true };
}
