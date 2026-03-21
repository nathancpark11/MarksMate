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
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_lower TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
    ON users (email_lower)
    WHERE email_lower IS NOT NULL
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS password_reset_codes (
      id         SERIAL PRIMARY KEY,
      user_id    TEXT NOT NULL,
      code_hash  TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      consumed_at TIMESTAMPTZ,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS password_reset_codes_user_id_idx
    ON password_reset_codes (user_id)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS guidance_datasets (
      id           SERIAL PRIMARY KEY,
      ranks_key    TEXT UNIQUE NOT NULL,
      source       TEXT NOT NULL DEFAULT 'Official Marking Guide',
      ranks        TEXT NOT NULL DEFAULT '[]',
      chunks       TEXT NOT NULL DEFAULT '[]',
      generated_at TEXT NOT NULL DEFAULT '',
      uploaded_by  TEXT NOT NULL DEFAULT ''
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS guidance_upload_log (
      id                SERIAL PRIMARY KEY,
      rank              TEXT NOT NULL,
      source            TEXT NOT NULL DEFAULT 'Official Marking Guide',
      file_name         TEXT NOT NULL DEFAULT '',
      output_file       TEXT NOT NULL DEFAULT '',
      chunk_count       INTEGER NOT NULL DEFAULT 0,
      uploaded_at       TEXT NOT NULL DEFAULT '',
      uploaded_by       TEXT NOT NULL DEFAULT '',
      replaced_existing BOOLEAN NOT NULL DEFAULT FALSE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS guidance_pdf_files (
      id           SERIAL PRIMARY KEY,
      rank_key     TEXT UNIQUE NOT NULL,
      file_name    TEXT NOT NULL DEFAULT '',
      content_type TEXT NOT NULL DEFAULT 'application/pdf',
      pdf_base64   TEXT NOT NULL,
      uploaded_at  TEXT NOT NULL DEFAULT '',
      uploaded_by  TEXT NOT NULL DEFAULT ''
    )
  `;

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

  await sql`
    CREATE TABLE IF NOT EXISTS ai_usage_logs (
      id                      SERIAL PRIMARY KEY,
      user_id                 TEXT NOT NULL,
      endpoint                TEXT NOT NULL,
      model                   TEXT,
      prompt_tokens           INTEGER NOT NULL DEFAULT 0,
      completion_tokens       INTEGER NOT NULL DEFAULT 0,
      total_tokens            INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd      NUMERIC(14, 6) NOT NULL DEFAULT 0,
      success                 BOOLEAN NOT NULL DEFAULT TRUE,
      error_message           TEXT,
      document_upload_count   INTEGER NOT NULL DEFAULT 0,
      document_reference_count INTEGER NOT NULL DEFAULT 0,
      retrieval_call_count    INTEGER NOT NULL DEFAULT 0,
      doc_context_prompt_tokens INTEGER NOT NULL DEFAULT 0,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS ai_usage_logs_user_created_idx
    ON ai_usage_logs (user_id, created_at DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS ai_usage_logs_endpoint_created_idx
    ON ai_usage_logs (endpoint, created_at DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS user_metrics (
      user_id                 TEXT PRIMARY KEY,
      rank                    TEXT NOT NULL DEFAULT 'Unknown',
      rate                    TEXT NOT NULL DEFAULT 'Unknown',
      date_joined             TEXT NOT NULL DEFAULT '',
      is_active               BOOLEAN NOT NULL DEFAULT FALSE,
      last_active_at          TEXT,
      total_daily_logs        INTEGER NOT NULL DEFAULT 0,
      total_generated_bullets INTEGER NOT NULL DEFAULT 0,
      total_committed_marks   INTEGER NOT NULL DEFAULT 0,
      total_ai_calls          INTEGER NOT NULL DEFAULT 0,
      total_prompt_tokens     INTEGER NOT NULL DEFAULT 0,
      total_completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens            INTEGER NOT NULL DEFAULT 0,
      estimated_ai_cost_usd   NUMERIC(14, 6) NOT NULL DEFAULT 0,
      document_upload_count   INTEGER NOT NULL DEFAULT 0,
      document_reference_count INTEGER NOT NULL DEFAULT 0,
      retrieval_call_count    INTEGER NOT NULL DEFAULT 0,
      doc_context_prompt_tokens INTEGER NOT NULL DEFAULT 0,
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS user_metrics_rank_rate_idx
    ON user_metrics (rank, rate)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS monthly_metrics (
      id                  SERIAL PRIMARY KEY,
      user_id             TEXT NOT NULL DEFAULT '__all__',
      month               TEXT NOT NULL,
      new_users           INTEGER NOT NULL DEFAULT 0,
      active_users        INTEGER NOT NULL DEFAULT 0,
      bullets_generated   INTEGER NOT NULL DEFAULT 0,
      committed_marks     INTEGER NOT NULL DEFAULT 0,
      ai_calls            INTEGER NOT NULL DEFAULT 0,
      total_tokens        INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd  NUMERIC(14, 6) NOT NULL DEFAULT 0,
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS monthly_metrics_user_month_unique
    ON monthly_metrics (user_id, month)
  `;

  schemaInitialized = true;
}
