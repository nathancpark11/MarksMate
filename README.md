# Bullet Proof

This app uses OpenAI from server-side API routes only (under `app/api/*`).
That means your OpenAI key should be configured as a server environment variable and never exposed to client code.

## Environment Variables

Use `.env.example` as a reference.

Create `.env.local` in the project root:

```bash
OPENAI_API_KEY=your_openai_api_key_here
AUTH_SECRET=replace_with_a_long_random_secret
SENDGRID_API_KEY=SG.xxxxx
EMAIL_FROM=noreply@example.com
APP_BASE_URL=http://localhost:3000
PASSWORD_RESET_SECRET=replace_with_a_long_random_secret
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_MONTHLY_ID=price_xxx
STRIPE_PRICE_YEARLY_ID=price_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Important:

- Use `OPENAI_API_KEY` (no `NEXT_PUBLIC_` prefix).
- Never put your API key in client components, browser code, or public config.
- `NEXT_PUBLIC_*` variables are bundled into frontend code and visible in the browser.
- `APP_BASE_URL` must point to your deployed app URL in production so reset links are valid.
- Stripe secret values (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) must remain server-only.
- Configure Stripe webhook delivery to `POST /api/stripe/webhook`.

## Local Development

Run the dev server:

```bash
npm run dev
```

Open http://localhost:3000.

## Official Marking PDF Guidance

You can have AI reference your official marking PDF by extracting it into retrieval chunks.

1. Put your PDF at `data/official-marking-guide.pdf`.
2. Run:

```bash
npm run build:guidance
```

3. This creates `data/official-marking-guidance.json`.
4. The `POST /api/generate` route will automatically retrieve the most relevant guidance chunks and include them in the prompt.

### Multi-Rank Guidance (E-3 to E-7)

You can store separate guidance files per rank in `data/official-guidance/`.

Example commands:

```bash
node scripts/extract-official-guidance.mjs --input=data/e3-guide.pdf --output=data/official-guidance/e3.json --source="E-3 Official Marking Guide" --ranks=E-3
node scripts/extract-official-guidance.mjs --input=data/e4-guide.pdf --output=data/official-guidance/e4.json --source="E-4 Official Marking Guide" --ranks=E-4
node scripts/extract-official-guidance.mjs --input=data/e5-guide.pdf --output=data/official-guidance/e5.json --source="E-5 Official Marking Guide" --ranks=E-5
node scripts/extract-official-guidance.mjs --input=data/e6-guide.pdf --output=data/official-guidance/e6.json --source="E-6 Official Marking Guide" --ranks=E-6
node scripts/extract-official-guidance.mjs --input=data/e7-guide.pdf --output=data/official-guidance/e7.json --source="E-7 Official Marking Guide" --ranks=E-7
```

Behavior:

- If rank-tagged files exist, the API prefers guidance whose `ranks` includes the request rank.
- If no rank-specific match exists, it falls back to all available guidance.
- If `data/official-guidance/` is empty, it falls back to `data/official-marking-guidance.json`.

In-app option:

- Go to Settings -> Official Guidance Admin.
- Select one or more ranks, and upload a PDF.
- The app stores guidance in the database (`guidance_datasets`) as the primary source.
- When the app has write access to the project filesystem (local dev/self-hosted), it also mirrors each uploaded rank to `data/official-guidance/eX.json` so you can commit and push those files.
- Upload history is also mirrored to `data/official-guidance/upload-log.json` when writable, and the admin API merges DB + file history so the Upload Log stays consistent across environments after push.
- At runtime, guidance loading prefers database rows and falls back to files in `data/official-guidance/` (or `data/official-marking-guidance.json` legacy) when DB rows are unavailable.

Pre-push checklist (Official Guidance):

- Upload guidance from Settings -> Official Guidance Admin.
- Confirm `data/official-guidance/eX.json` and `data/official-guidance/upload-log.json` changed locally.
- Commit those files with your code changes.
- Push and verify Upload Log entries appear in the deployed admin view.

Optional:

- To use a different guidance file path, set `OFFICIAL_MARKING_GUIDANCE_JSON`.
- To use a different guidance directory, set `OFFICIAL_MARKING_GUIDANCE_DIR`.
- To use a custom filename, run:

```bash
node scripts/extract-official-guidance.mjs --input=data/your-file.pdf --output=data/official-marking-guidance.json --source="Your Official Guide"
```

## Vercel Setup (Production + Preview)

1. Open your project in Vercel.
2. Go to Settings -> Environment Variables.
3. Add:
	- Name: `OPENAI_API_KEY`
	- Value: your real OpenAI key
	- Environments: Production, Preview, and Development (recommended)
4. Add `AUTH_SECRET` with a long random value.
5. Redeploy the project so new variables are available at runtime.

## Verify Key Is Not Exposed

- Keep OpenAI calls in route handlers like `app/api/*/route.ts`.
- Do not import `openai` in client components.
- In browser devtools, you should never see the value of `OPENAI_API_KEY`.

## Admin Analytics Export System

This app now includes a protected admin analytics tab and server-side Excel export.

### What Was Added

- Admin-only dashboard tab: `Admin Analytics`
- Protected analytics API: `GET /api/admin/analytics/overview`
- Protected export API: `GET /api/admin/analytics/export`
- Server-side `.xlsx` generation with `exceljs`
- Raw AI usage event logging (`ai_usage_logs`)
- Summary metrics tables (`user_metrics`, `monthly_metrics`)
- Centralized model/token pricing utility for cost estimates

### Access Control

- Analytics APIs require an authenticated session and admin username check.
- Non-admin users receive `403` from admin analytics routes.
- Exported data contains metrics/cost aggregates and masked identifiers only.

### Dependency

- `exceljs` is required for XLSX generation.

### Analytics Data Model

Schema initialization now includes these analytics tables:

- `ai_usage_logs`: one row per AI request (model, tokens, estimated cost, endpoint, user, time)
- `user_metrics`: precomputed per-user totals used by dashboard/export
- `monthly_metrics`: monthly aggregate trend rows for reporting

The existing `users` and `user_data` tables continue to provide profile and activity source data.

### Phase-1 Instrumentation Scope

AI usage logging is currently wired in these routes:

- `/api/generate`
- `/api/smart-insights`
- `/api/build-marks-package`
- `/api/evaluate-category-quality`

Additional client-side event logging can be layered on top later without changing the schema.

### Validation Checklist

Use this checklist after deploy:

1. Admin UI visibility
2. Log in as admin and confirm the `Admin Analytics` tab is visible.
3. Log in as non-admin and confirm the tab is not visible.

4. API protection
5. As admin, request `GET /api/admin/analytics/overview` and confirm `200`.
6. As non-admin, request `GET /api/admin/analytics/overview` and confirm `403`.
7. As unauthenticated user, request `GET /api/admin/analytics/overview` and confirm `401`.

8. XLSX export
9. As admin, click `Export XLSX` and confirm a valid workbook downloads.
10. Confirm workbook tabs exist: `User Summary`, `Aggregate Metrics`, `Monthly Trends`.
11. Confirm identifiers are masked and no raw bullet/log/document text is exported.

12. Data quality
13. Generate a few marks and trigger dashboard AI routes.
14. Confirm `ai_usage_logs` rows are created with endpoint/model/token/cost fields.
15. Refresh Admin Analytics and confirm totals increase as expected.
