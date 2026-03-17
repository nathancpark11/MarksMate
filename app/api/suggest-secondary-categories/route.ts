import OpenAI from "openai";
import { parseLimitedJsonBody } from "@/lib/aiRequestGuards";
import { requireSessionUser } from "@/lib/auth";
import { validateCombinedAiInputs } from "@/lib/promptSpamGuard";
import { enforceRateLimits } from "@/lib/rateLimit";
import { getRequestId, logApiError, logApiRequestMetadata } from "@/lib/safeLogging";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "missing-openai-api-key",
});

function stripCodeFences(raw: string) {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

const CATEGORIES = [
  "Military Bearing",
  "Customs, Courtesies and Traditions",
  "Quality of Work",
  "Technical Proficiency",
  "Initiative",
  "Decision Making and Problem Solving",
  "Military Readiness",
  "Self Awareness and Learning",
  "Team Building",
  "Respect for Others",
  "Accountability and Responsibility",
  "Influencing Others",
  "Effective Communication",
];

export async function POST(req: Request) {
  const routeName = "/api/suggest-secondary-categories";
  const requestId = getRequestId(req);
  let inputLength = 0;

  try {
    const { response: authResponse } = await requireSessionUser();
    if (authResponse) return authResponse;

    const rateLimitResponse = enforceRateLimits(req, [
      {
        key: "suggest-secondary-categories-per-hour",
        maxRequests: 20,
        windowMs: 60 * 60 * 1000,
        errorMessage: "Hourly rate limit reached for alternate category suggestions.",
      },
    ]);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: "Server misconfiguration: OPENAI_API_KEY is not set." },
        { status: 500 }
      );
    }

    const parsedBody = await parseLimitedJsonBody<{
      bullet?: unknown;
      action?: unknown;
      primaryCategory?: unknown;
    }>(req);
    inputLength = parsedBody.bodyBytes;
    if (!parsedBody.ok) {
      logApiRequestMetadata({ requestId, routeName, inputLength, success: false, status: parsedBody.response.status });
      return parsedBody.response;
    }

    const { bullet, action, primaryCategory } = parsedBody.data;

    const bulletText = typeof bullet === "string" ? bullet.trim() : "";
    const actionText = typeof action === "string" ? action.trim() : "";
    const primaryCategoryText = typeof primaryCategory === "string" ? primaryCategory.trim() : "";

    if (!bulletText || !actionText) {
      return Response.json({ error: "Missing bullet or action." }, { status: 400 });
    }

    const promptSpamError = validateCombinedAiInputs([bulletText, actionText]);
    if (promptSpamError) {
      return Response.json({ error: promptSpamError }, { status: 400 });
    }

    const otherCategories = CATEGORIES.filter((c) => c !== primaryCategoryText);

    const prompt = `You are analyzing a performance evaluation mark for a U.S. Coast Guard member.

GENERATED MARK: ${bulletText}
ORIGINAL ACCOMPLISHMENT: ${actionText}
PRIMARY CATEGORY: ${primaryCategoryText || "Unknown"}

Available alternate categories (do NOT suggest the primary category):
${otherCategories.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Identify 1-2 of these alternate categories where the SAME accomplishment could genuinely support a distinct, compelling performance mark. Only suggest categories with a real, meaningful connection — not superficial overlap.

Return JSON ONLY (no markdown, no explanation):
{
  "hasAlternatives": true,
  "categories": [
    { "name": "<exact category name from list>", "reason": "<1 sentence why this accomplishment fits this category>" }
  ]
}

If no strong alternates exist, return:
{ "hasAlternatives": false, "categories": [] }`;

    const completion = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 250,
      temperature: 0.4,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const cleaned = stripCodeFences(raw);

    try {
      const parsed = JSON.parse(cleaned) as {
        hasAlternatives?: boolean;
        categories?: Array<{ name: string; reason: string }>;
      };
      logApiRequestMetadata({ requestId, routeName, inputLength, success: true, status: 200 });
      return Response.json({
        hasAlternatives: parsed.hasAlternatives ?? false,
        categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      });
    } catch {
      logApiRequestMetadata({ requestId, routeName, inputLength, success: true, status: 200 });
      return Response.json({ hasAlternatives: false, categories: [] });
    }
  } catch (err) {
    logApiError("/api/suggest-secondary-categories error", err, { requestId, routeName, inputLength, success: false });
    logApiRequestMetadata({ requestId, routeName, inputLength, success: false, status: 500 });
    return Response.json({ error: "Unable to suggest alternate categories right now. Please try again." }, { status: 500 });
  }
}
