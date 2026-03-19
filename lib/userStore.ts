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
  planStatus: string;
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
  const rawPlanStatus = row.plan_status;
  const rawUpdatedAt = row.updated_at;

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
    planStatus: typeof rawPlanStatus === "string" && rawPlanStatus.trim().length > 0 ? rawPlanStatus : "free",
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
    planStatus: "free",
    updatedAt: createdAt,
  };
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
