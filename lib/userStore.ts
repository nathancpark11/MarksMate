import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type UserRecord = {
  id: string;
  username: string;
  usernameLower: string;
  passwordHash: string;
  createdAt: string;
  hasCompletedTutorial: boolean;
};

type UserStore = {
  users: UserRecord[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

async function ensureUsersFile() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await readFile(USERS_FILE, "utf-8");
  } catch {
    const initial: UserStore = { users: [] };
    await writeFile(USERS_FILE, JSON.stringify(initial, null, 2), "utf-8");
  }
}

async function readStore(): Promise<UserStore> {
  await ensureUsersFile();
  const raw = await readFile(USERS_FILE, "utf-8");
  const parsed = JSON.parse(raw) as UserStore;

  if (!parsed || !Array.isArray(parsed.users)) {
    return { users: [] };
  }

  return {
    users: parsed.users.map((user) => ({
      ...user,
      hasCompletedTutorial:
        typeof user.hasCompletedTutorial === "boolean" ? user.hasCompletedTutorial : true,
    })),
  };
}

async function writeStore(store: UserStore) {
  await writeFile(USERS_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export function sanitizeUsername(username: string) {
  return username.trim();
}

export function toUsernameLower(username: string) {
  return sanitizeUsername(username).toLowerCase();
}

export async function findUserByUsername(username: string) {
  const usernameLower = toUsernameLower(username);
  const store = await readStore();
  return store.users.find((user) => user.usernameLower === usernameLower) ?? null;
}

export async function findUserById(id: string) {
  const store = await readStore();
  return store.users.find((user) => user.id === id) ?? null;
}

export async function createUser(input: {
  username: string;
  passwordHash: string;
}) {
  const username = sanitizeUsername(input.username);
  const usernameLower = toUsernameLower(username);
  const store = await readStore();

  const existing = store.users.find((user) => user.usernameLower === usernameLower);
  if (existing) {
    throw new Error("USER_EXISTS");
  }

  const user: UserRecord = {
    id: randomUUID(),
    username,
    usernameLower,
    passwordHash: input.passwordHash,
    createdAt: new Date().toISOString(),
    hasCompletedTutorial: false,
  };

  store.users.push(user);
  await writeStore(store);
  return user;
}

export async function markTutorialCompleted(id: string) {
  const store = await readStore();
  const user = store.users.find((entry) => entry.id === id);

  if (!user) {
    return null;
  }

  user.hasCompletedTutorial = true;
  await writeStore(store);
  return user;
}

export async function deleteUserById(id: string) {
  const store = await readStore();
  const next = store.users.filter((user) => user.id !== id);
  await writeStore({ users: next });
}
