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
- Enter a guide name, select one or more ranks, and upload a PDF.
- The app will extract text, chunk it, write JSON into `data/official-guidance/`, and refresh guidance cache automatically.

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
