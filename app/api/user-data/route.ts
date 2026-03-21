import { requireSessionUser } from "@/lib/auth";
import { sql, ensureSchema } from "@/lib/db";
import { sanitizeUnknownStrings } from "@/lib/textSanitization";

const ALLOWED_KEYS = new Set([
  "history",
  "log",
  "settings",
  "dashboardTotalEstimate",
  "savedBulletproofSevens",
  "bulletproofSevenAnalysis",
  "exportHistory",
]);

export async function GET(req: Request) {
  const { user, response } = await requireSessionUser();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");

  if (!key || !ALLOWED_KEYS.has(key)) {
    return Response.json({ error: "Invalid key." }, { status: 400 });
  }

  await ensureSchema();

  const result = await sql`
    SELECT data_value FROM user_data WHERE user_id = ${user.id} AND data_key = ${key}
  `;

  if (result.rows.length === 0) {
    return Response.json({ value: null });
  }

  try {
    const parsed = JSON.parse(result.rows[0].data_value as string) as unknown;
    return Response.json({ value: parsed });
  } catch {
    return Response.json({ value: null });
  }
}

export async function PUT(req: Request) {
  const { user, response } = await requireSessionUser();
  if (response) return response;

  const body = (await req.json()) as { key?: string; value?: unknown };
  const { key, value } = body;

  if (!key || !ALLOWED_KEYS.has(key)) {
    return Response.json({ error: "Invalid key." }, { status: 400 });
  }

  await ensureSchema();

  const valueToStore = key === "settings" ? sanitizeUnknownStrings(value) : value;
  const serialized = JSON.stringify(valueToStore);

  await sql`
    INSERT INTO user_data (user_id, data_key, data_value)
    VALUES (${user.id}, ${key}, ${serialized})
    ON CONFLICT (user_id, data_key) DO UPDATE
    SET data_value = EXCLUDED.data_value, updated_at = NOW()
  `;

  return Response.json({ ok: true });
}
