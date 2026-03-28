import OpenAI from "openai";
import { parseLimitedJsonBody } from "@/lib/aiRequestGuards";
import { logAiUsageEvent } from "@/lib/analytics/logging";
import { requireSessionUser } from "@/lib/auth";
import { isGuidanceAdminUsername } from "@/lib/admin";
import { enforcePremiumFeatureAccess } from "@/lib/usageLimits";
import { validateCombinedAiInputs } from "@/lib/promptSpamGuard";
import { enforceRateLimits } from "@/lib/rateLimit";
import { getRequestId, logApiError, logApiRequestMetadata } from "@/lib/safeLogging";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "missing-openai-api-key",
});

const DASHBOARD_ANALYSIS_MODEL = process.env.OPENAI_MODEL_DASHBOARD_ANALYSIS ?? process.env.OPENAI_MODEL_STRONG ?? "gpt-4.1";
const DASHBOARD_INPUT_GUARD_LIMITS = {
  maxItems: 240,
  maxCombinedChars: 40000,
};

function stripCodeFences(value: string) {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export async function POST(req: Request) {
  const routeName = "/api/smart-insights";
  const requestId = getRequestId(req);
  let inputLength = 0;
  let userIdForLogging: string | null = null;

  try {
    const { user, response: authResponse } = await requireSessionUser();
    if (authResponse || !user) {
      return authResponse ?? Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    userIdForLogging = user.id;

    if (!isGuidanceAdminUsername(user.username)) {
      const premiumAccess = await enforcePremiumFeatureAccess(user.id, "AI Smart Insights");
      if (!premiumAccess.allowed) {
        return Response.json({ error: premiumAccess.reason, code: premiumAccess.code }, { status: 403 });
      }
    }

    if (!isGuidanceAdminUsername(user.username)) {
      const rateLimitResponse = enforceRateLimits(req, [
        {
          key: "smart-insights-per-hour",
          maxRequests: 3,
          windowMs: 60 * 60 * 1000,
          errorMessage: "Hourly rate limit reached for dashboard analysis.",
        },
      ]);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
    }

    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: "Server misconfiguration: OPENAI_API_KEY is not set." },
        { status: 500 }
      );
    }

    const parsedBody = await parseLimitedJsonBody<{
      rankLevel?: string;
      allCategories?: string[];
      bulletsByCategory?: Record<string, string[]>;
    }>(req);
    inputLength = parsedBody.bodyBytes;
    if (!parsedBody.ok) {
      logApiRequestMetadata({ requestId, routeName, inputLength, success: false, status: parsedBody.response.status });
      return parsedBody.response;
    }

    const { rankLevel, allCategories, bulletsByCategory } = parsedBody.data;

    if (
      !allCategories ||
      !Array.isArray(allCategories) ||
      !bulletsByCategory ||
      typeof bulletsByCategory !== "object"
    ) {
      return Response.json({ error: "Missing required fields." }, { status: 400 });
    }

    const normalizedBulletsByCategory = Object.fromEntries(
      Object.entries(bulletsByCategory).map(([categoryName, maybeBullets]) => [
        categoryName,
        Array.isArray(maybeBullets)
          ? maybeBullets
              .filter((bullet): bullet is string => typeof bullet === "string")
              .map((bullet) => bullet.trim())
              .filter(Boolean)
          : [],
      ])
    );
    const normalizedCategories = allCategories
      .filter((category): category is string => typeof category === "string")
      .map((category) => category.trim())
      .filter(Boolean);

    const totalBullets = Object.values(normalizedBulletsByCategory).reduce(
      (sum, arr) => sum + arr.length,
      0
    );

    if (totalBullets === 0) {
      return Response.json({
        underrepresentedCategories: [],
        bulletsLackingResults: [],
        preCloseActions: [],
        repetitionGroups: [],
      });
    }

    const flattenedBullets = Object.values(normalizedBulletsByCategory)
      .flat()
      .filter(Boolean);
    const promptSpamError = validateCombinedAiInputs(
      [...flattenedBullets, ...normalizedCategories],
      DASHBOARD_INPUT_GUARD_LIMITS
    );
    if (promptSpamError) {
      return Response.json({ error: promptSpamError }, { status: 400 });
    }

    const prompt = `You are an expert advisor helping a U.S. military service member strengthen their evaluation (EER/OER) before marks close.

Current rank: ${rankLevel || "Not specified"}

Full list of EER categories:
${normalizedCategories.join("\n")}

Current bullets by category (categories with empty arrays have 0 bullets):
${JSON.stringify(normalizedBulletsByCategory, null, 2)}

Analyze the above and return a JSON object with exactly these four fields:

1. "underrepresentedCategories": Array of categories that have 0 or 1 bullets. For each entry provide:
   - "category": the category name (string)
   - "bulletCount": how many bullets it currently has (number)
   - "suggestedAction": one specific, realistic action the service member can take to strengthen this category before marks close (string, 1-2 sentences)

2. "bulletsLackingResults": Array of bullets that state an action but do NOT include any measurable or quantifiable outcome (no numbers, percentages, ranks, or concrete scope). For each entry provide:
   - "bullet": the original bullet text (string)
   - "category": its category name (string)
  - "suggestedImprovement": a rewritten version of the bullet that adds a realistic measurable result; use bracketed placeholders if the exact figure is unknown (string)

3. "preCloseActions": Exactly 4-5 specific, realistic things this service member can still do before evaluation marks close to strengthen their overall record. Base suggestions on gaps in their current bullets. For each entry provide:
   - "action": the specific suggestion (string, 1 sentence)
   - "feasibility": an integer 0-100 representing the percentage likelihood this action is achievable in the time remaining before marks close, given typical military schedules and lead times

4. "repetitionGroups": Groups of bullets (across any categories) that repeat the same underlying theme or accomplishment with minimal differentiation. Only flag groups of 2 or more bullets. For each group provide:
   - "theme": 3-6 word label describing the repeated theme (string)
   - "bullets": array of the repeated bullet texts (string[])
   - "category": primary category these bullets belong to (string)
   - "suggestion": one sentence advising how to consolidate or differentiate these bullets to maximize scoring impact (string)

Rules:
- Return only valid JSON — no markdown, no prose outside the JSON object.
- If a field has no findings, return an empty array [] for it.
- Do not invent bullets or events that are not in the input data.
- "bulletsLackingResults" should only flag bullets that truly have no numbers, rates, counts, or scope descriptors.

Measurable-results guidance for "suggestedImprovement" (important):
- Prefer concrete non-percentage metrics first: counts, quantities, frequency, timelines, readiness status, inspection outcomes, qualifications completed, personnel trained, equipment availability, missions supported.
- Use placeholders like [N personnel], [N hours], [N qualifications], [N inspections], [N missions], [N items], [N days], [N tasks] whenever possible.
- Avoid percentage placeholders by default. Only use [X%] when the underlying accomplishment is naturally percentage-based (e.g., pass rate, completion rate, error rate, availability rate) or when no other realistic measurable format fits.
- Do not use vague percentages when a count/time/volume metric is more credible.`;

    const completion = await client.chat.completions.create({
      model: DASHBOARD_ANALYSIS_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 2000,
    });

    await logAiUsageEvent({
      userId: user.id,
      endpoint: routeName,
      model: DASHBOARD_ANALYSIS_MODEL,
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens: completion.usage?.total_tokens,
      success: true,
    });

    const rawOutput = completion.choices[0]?.message?.content?.trim() || "{}";

    let parsed: {
      underrepresentedCategories?: Array<{
        category: string;
        bulletCount: number;
        suggestedAction: string;
      }>;
      bulletsLackingResults?: Array<{
        bullet: string;
        category: string;
        suggestedImprovement: string;
      }>;
      preCloseActions?: Array<{ action: string; feasibility: number }>;
      repetitionGroups?: Array<{
        theme: string;
        bullets: string[];
        category: string;
        suggestion: string;
      }>;
    };

    try {
      parsed = JSON.parse(stripCodeFences(rawOutput));
    } catch {
      return Response.json(
        { error: "AI could not generate insights at this time." },
        { status: 500 }
      );
    }

    const clampFeasibility = (v: unknown) =>
      typeof v === "number" && !Number.isNaN(v)
        ? Math.max(0, Math.min(100, Math.round(v)))
        : 50;

    logApiRequestMetadata({ requestId, routeName, inputLength, success: true, status: 200 });
    return Response.json({
      underrepresentedCategories: (parsed.underrepresentedCategories ?? []).filter(
        (e) => typeof e.category === "string" && typeof e.suggestedAction === "string"
      ),
      bulletsLackingResults: (parsed.bulletsLackingResults ?? []).filter(
        (e) => typeof e.bullet === "string" && typeof e.suggestedImprovement === "string"
      ),
      preCloseActions: (parsed.preCloseActions ?? [])
        .filter((e) => typeof e.action === "string")
        .map((e) => ({ action: e.action, feasibility: clampFeasibility(e.feasibility) })),
      repetitionGroups: (parsed.repetitionGroups ?? []).filter(
        (e) =>
          typeof e.theme === "string" &&
          Array.isArray(e.bullets) &&
          e.bullets.length >= 2 &&
          typeof e.suggestion === "string"
      ),
    });
  } catch (error: unknown) {
    if (userIdForLogging) {
      try {
        await logAiUsageEvent({
          userId: userIdForLogging,
          endpoint: routeName,
          model: DASHBOARD_ANALYSIS_MODEL,
          success: false,
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        });
      } catch {
        // Avoid masking the original endpoint failure.
      }
    }

    logApiError("Smart insights error", error, { requestId, routeName, inputLength, success: false });
    logApiRequestMetadata({ requestId, routeName, inputLength, success: false, status: 500 });
    return Response.json({ error: "AI insights are unavailable right now. Please try again." }, { status: 500 });
  }
}
