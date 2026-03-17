# Bullet Proof

This app uses OpenAI from server-side API routes only (under `app/api/*`).
That means your OpenAI key should be configured as a server environment variable and never exposed to client code.

## Environment Variables

Use `.env.example` as a reference.

Create `.env.local` in the project root:

```bash
OPENAI_API_KEY=your_openai_api_key_here
AUTH_SECRET=replace_with_a_long_random_secret
```

Important:

- Use `OPENAI_API_KEY` (no `NEXT_PUBLIC_` prefix).
- Never put your API key in client components, browser code, or public config.
- `NEXT_PUBLIC_*` variables are bundled into frontend code and visible in the browser.

## Local Development

Run the dev server:

```bash
npm run dev
```

Open http://localhost:3000.

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
