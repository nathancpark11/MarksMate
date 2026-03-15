import { randomUUID } from "node:crypto";
import { sql, ensureSchema } from "./db";

export type UserRecord = {
  id: string;
  username: string;
  usernameLower: string;
  passwordHash: string;
  createdAt: string;
  hasCompletedTutorial: boolean;
};

export function sanitizeUsername(username: string) {
  return username.trim();
}

export function toUsernameLower(username: string) {
  return sanitizeUsername(username).toLowerCase();
}

function rowToUser(row: Record<string, unknown>): UserRecord {
  return {
    id: row.id as string,
    username: row.username as string,
    usernameLower: row.username_lower as string,
    passwordHash: row.password_hash as string,
    createdAt: row.created_at as string,
    hasCompletedTutorial: row.has_completed_tutorial as boolean,
  };
}

export async function findUserByUsername(username: string): Promise<UserRecord | null> {
  await ensureSchema();
  const usernameLower = toUsernameLower(username);
  const result = await sql`SELECT * FROM users WHERE username_lower = ${usernameLower}`;
  return result.rows.length > 0 ? rowToUser(result.rows[0]) : null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  await ensureSchema();
  const result = await sql`SELECT * FROM users WHERE id = ${id}`;
  return result.rows.length > 0 ? rowToUser(result.rows[0]) : null;
}

export async function createUser(input: {
  username: string;
  passwordHash: string;
}): Promise<UserRecord> {
  await ensureSchema();
  const username = sanitizeUsername(input.username);
  const usernameLower = toUsernameLower(username);

  const existing = await sql`SELECT id FROM users WHERE username_lower = ${usernameLower}`;
  if (existing.rows.length > 0) {
    throw new Error("USER_EXISTS");
  }

  const id = randomUUID();
  const createdAt = new Date().toISOString();

  await sql`
    INSERT INTO users (id, username, username_lower, password_hash, created_at, has_completed_tutorial)
    VALUES (${id}, ${username}, ${usernameLower}, ${input.passwordHash}, ${createdAt}, FALSE)
  `;

  return { id, username, usernameLower, passwordHash: input.passwordHash, createdAt, hasCompletedTutorial: false };
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
