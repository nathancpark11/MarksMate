import OpenAI from "openai";
import { parseLimitedJsonBody } from "@/lib/aiRequestGuards";
import { requireSessionUser } from "@/lib/auth";
import { validateCombinedAiInputs } from "@/lib/promptSpamGuard";
import { enforceRateLimits } from "@/lib/rateLimit";
import { getRequestId, logApiError, logApiRequestMetadata } from "@/lib/safeLogging";
import { enforcePremiumFeatureAccess } from "@/lib/usageLimits";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "missing-openai-api-key",
});

type SplitRecommendation = {
  shouldSplit: boolean;
  reason: string;
  splitActions: string[];
};

function stripCodeFences(text: string) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export async function POST(req: Request) {
  const routeName = "/api/recommend-bullet-split";
  const requestId = getRequestId(req);
  let inputLength = 0;

  try {
    const { user, response: authResponse } = await requireSessionUser();
    if (authResponse) {
      return authResponse;
    }

    const premiumAccess = await enforcePremiumFeatureAccess(user.id, "Split recommendations");
    if (!premiumAccess.allowed) {
      return Response.json(
        {
          error: premiumAccess.reason,
          code: premiumAccess.code,
          usage: premiumAccess.summary,
        },
        { status: 403 }
      );
    }

    const rateLimitResponse = enforceRateLimits(req, [
      {
        key: "recommend-bullet-split-per-hour",
        maxRequests: 20,
        windowMs: 60 * 60 * 1000,
        errorMessage: "Hourly rate limit reached for split recommendations.",
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
      accomplishment?: unknown;
      bullet?: unknown;
    }>(req);
    inputLength = parsedBody.bodyBytes;
    if (!parsedBody.ok) {
      logApiRequestMetadata({ requestId, routeName, inputLength, success: false, status: parsedBody.response.status });
      return parsedBody.response;
    }

    const { accomplishment, bullet } = parsedBody.data;

    if (typeof accomplishment !== "string" || !accomplishment.trim()) {
      return Response.json({ error: "Missing accomplishment to review." }, { status: 400 });
    }

    const promptSpamError = validateCombinedAiInputs([
      typeof accomplishment === "string" ? accomplishment : "",
      typeof bullet === "string" ? bullet : "",
    ]);
    if (promptSpamError) {
      return Response.json({ error: promptSpamError }, { status: 400 });
    }

    const prompt = `You review Coast Guard evaluation input and decide whether it should be split into more than one bullet.

Return JSON only with this exact shape:
  {"shouldSplit":true,"reason":"...","splitActions":["...","..."]}

Rules:
- Set shouldSplit to true only when the accomplishment clearly combines distinct actions that would likely be stronger as separate bullets.
- Keep related actions together when they are part of the same event, task, or outcome.
- reason must be concise, specific, and no more than 2 sentences.
  - When shouldSplit is true, splitActions must list each separate action as a short standalone accomplishment sentence.
  - Return 2 to 4 splitActions when splitting.
  - If no split is recommended, return shouldSplit false and splitActions as an empty array.
  - Do not rewrite the full bullet. Only identify whether to split and which actions should stand alone.

Example:
Input accomplishment: Worked out airman, worked out airman during PT, conducted fitness test for airman, and conducted PTA for 15 shop personnel.
  Output: {"shouldSplit":true,"reason":"The accomplishment combines PT support for one airman with a separate PTA event for a larger group.","splitActions":["Worked out airman during PT and conducted fitness test for that airman.","Conducted PTA for 15 shop personnel."]}

Accomplishment:
${accomplishment}

Generated bullet:
${typeof bullet === "string" ? bullet : "Not provided"}`;

    const completion = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 180,
      temperature: 0.2,
    });

    const rawOutput = completion.choices[0]?.message?.content?.trim() || "";

    try {
      const parsed = JSON.parse(stripCodeFences(rawOutput)) as Partial<SplitRecommendation>;
      logApiRequestMetadata({ requestId, routeName, inputLength, success: true, status: 200 });
      return Response.json({
        recommendation: {
          shouldSplit: Boolean(parsed.shouldSplit),
          reason: typeof parsed.reason === "string" ? parsed.reason.trim() : "",
          splitActions: Array.isArray(parsed.splitActions)
            ? parsed.splitActions
                .filter((action): action is string => typeof action === "string")
                .map((action) => action.trim())
                .filter(Boolean)
            : [],
        },
      });
    } catch {
      logApiRequestMetadata({ requestId, routeName, inputLength, success: true, status: 200 });
      return Response.json({
        recommendation: {
          shouldSplit: false,
          reason: "Recommendation unavailable.",
          splitActions: [],
        },
      });
    }
  } catch (error: unknown) {
    logApiError("Recommend bullet split error", error, { requestId, routeName, inputLength, success: false });
    logApiRequestMetadata({ requestId, routeName, inputLength, success: false, status: 500 });
    return Response.json(
      { error: "Unable to review split recommendation right now. Please try again." },
      { status: 500 }
    );
  }
}