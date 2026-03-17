import { neon } from "@neondatabase/serverless";

type NeonSQL = ReturnType<typeof neon>;
let _sql: NeonSQL | null = null;

function getDb(): NeonSQL {
  if (!_sql) {
    const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL (or POSTGRES_URL) is not set. " +
          "Add a Neon database in the Vercel dashboard and link it to your project, " +
          "then run `vercel env pull .env.local` for local development."
      );
    }
    _sql = neon(url);
  }
  return _sql;
}

// Thin wrapper that returns { rows } to match the @vercel/postgres interface.
export async function sql(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<{ rows: Record<string, unknown>[] }> {
  const db = getDb();
  const rows = (await db(strings, ...values)) as Record<string, unknown>[];
  return { rows };
}

let schemaInitialized = false;

export async function ensureSchema(): Promise<void> {
  if (schemaInitialized) return;

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id                    TEXT PRIMARY KEY,
      username              TEXT UNIQUE NOT NULL,
      username_lower        TEXT UNIQUE NOT NULL,
      password_hash         TEXT NOT NULL,
      created_at            TEXT NOT NULL,
      has_completed_tutorial BOOLEAN NOT NULL DEFAULT FALSE
    )
  `;

  // Additive-only migrations for existing deployments.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_status TEXT NOT NULL DEFAULT 'free'`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;

  await sql`
    CREATE TABLE IF NOT EXISTS user_data (
      user_id    TEXT NOT NULL,
      data_key   TEXT NOT NULL,
      data_value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, data_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `;

  schemaInitialized = true;
}
