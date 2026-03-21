import OpenAI from "openai";
import { parseLimitedJsonBody } from "@/lib/aiRequestGuards";
import { requireSessionUser } from "@/lib/auth";
import { logAiUsageEvent } from "@/lib/analytics/logging";
import { isGuidanceAdminUsername } from "@/lib/admin";
import { validateCombinedAiInputs } from "@/lib/promptSpamGuard";
import { enforceRateLimits } from "@/lib/rateLimit";
import { getRequestId, logApiError, logApiRequestMetadata } from "@/lib/safeLogging";
import { getMarkDescriptionsForCategory } from "@/lib/officialGuidance";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "missing-openai-api-key",
});

const DASHBOARD_ANALYSIS_MODEL = process.env.OPENAI_MODEL_DASHBOARD_ANALYSIS ?? process.env.OPENAI_MODEL_STRONG ?? "gpt-4.1";
const DASHBOARD_INPUT_GUARD_LIMITS = {
  maxItems: 240,
  maxCombinedChars: 40000,
};

type CategoryEvaluations = Record<
  string,
  {
    breakdown: {
      impact: number;
      leadershipLevel: number;
      scopeOfResponsibility: number;
      measurableResults: number;
      initiative: number;
      alignmentToCategory: number;
    };
    aiExplanation: string;
    compiledScore: number;
  }
>;

function clampScore(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 1;
  }

  return Math.max(1, Math.min(10, Math.round(value)));
}

function stripCodeFences(value: string) {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function compileScoreFromBreakdown(breakdown: {
  impact: number;
  leadershipLevel: number;
  scopeOfResponsibility: number;
  measurableResults: number;
  initiative: number;
  alignmentToCategory: number;
}) {
  const averageScore =
    (breakdown.impact +
      breakdown.leadershipLevel +
      breakdown.scopeOfResponsibility +
      breakdown.measurableResults +
      breakdown.initiative +
      breakdown.alignmentToCategory) /
    6;

  const normalizedScore = 4 + ((averageScore - 1) / 9) * 3;
  return Math.round(normalizedScore * 10) / 10;
}

export async function POST(req: Request) {
  const routeName = "/api/evaluate-category-quality";
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
      const rateLimitResponse = enforceRateLimits(req, [
        {
          key: "evaluate-category-quality-per-hour",
          maxRequests: 12,
          windowMs: 60 * 60 * 1000,
          errorMessage: "Hourly rate limit reached for category evaluation.",
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
      categories?: Record<string, string[]>;
    }>(req);
    inputLength = parsedBody.bodyBytes;
    if (!parsedBody.ok) {
      logApiRequestMetadata({ requestId, routeName, inputLength, success: false, status: parsedBody.response.status });
      return parsedBody.response;
    }

    const { rankLevel, categories } = parsedBody.data;

    if (!categories || typeof categories !== "object") {
      return Response.json(
        { error: "Missing categories to evaluate." },
        { status: 400 }
      );
    }

    const normalizedCategories = Object.fromEntries(
      Object.entries(categories).map(([categoryName, maybeBullets]) => [
        categoryName,
        Array.isArray(maybeBullets)
          ? maybeBullets
              .filter((bullet): bullet is string => typeof bullet === "string")
              .map((bullet) => bullet.trim())
              .filter(Boolean)
          : [],
      ])
    );

    const populatedCategories = Object.entries(normalizedCategories).filter(
      ([, bullets]) => bullets.length > 0
    );

    if (populatedCategories.length === 0) {
      return Response.json({ evaluations: {} });
    }

    const categoryInputs = populatedCategories.flatMap(([category, bullets]) => [
      category,
      ...bullets.filter((bullet): bullet is string => typeof bullet === "string"),
    ]);
    const promptSpamError = validateCombinedAiInputs(categoryInputs, DASHBOARD_INPUT_GUARD_LIMITS);
    if (promptSpamError) {
      return Response.json({ error: promptSpamError }, { status: 400 });
    }

    const categoryMarkDescriptions: Record<string, string> = {};
    const rankLevelValue = typeof rankLevel === "string" && rankLevel ? rankLevel : "E5";
    await Promise.all(
      populatedCategories.map(async ([category]) => {
        const descriptions = await getMarkDescriptionsForCategory({
          category,
          rankLevel: rankLevelValue,
          maxChunks: 4,
        });
        if (descriptions) {
          categoryMarkDescriptions[category] = descriptions;
        }
      })
    );

    const guidanceBlock = Object.entries(categoryMarkDescriptions)
      .map(([cat, text]) => `${cat}:\n${text}`)
      .join("\n\n");

    const prompt = `You are evaluating groups of performance bullets for a U.S. military evaluation dashboard.

Score each category on a 1-10 scale for:
- impact
- leadershipLevel
- scopeOfResponsibility
- measurableResults
- initiative
- alignmentToCategory

Instructions:
- Evaluate the combination of bullets within each category, not each bullet separately.
- Base scores only on evidence explicitly present in the bullets.
- Do not reward quantity alone.
- alignmentToCategory measures how well the bullets actually support the named category.
- When Official Mark Descriptions are provided below, use the language and performance criteria in those descriptions to calibrate your scores. A bullet that closely matches the language and standards of a mark of 6 should score accordingly; one matching a mark of 2 or 4 should score lower.
- aiExplanation must be exactly 1 sentence, 20-40 words.
- aiExplanation must begin with "Recommended <score>:" using the compiled 4-7 score you intend to recommend.
- aiExplanation must cite specific evidence from the bullets: mention bullet volume, consistency of impact statements, measurable results, above-peer performance indicators, or gaps — whichever are most relevant.
- Do not use vague phrases like "good performance" or "some bullets". Be precise.
- Return valid JSON only.

Use this exact shape:
{
  "evaluations": {
    "Category Name": {
      "breakdown": {
        "impact": 7,
        "leadershipLevel": 6,
        "scopeOfResponsibility": 5,
        "measurableResults": 8,
        "initiative": 7,
        "alignmentToCategory": 9
      },
      "aiExplanation": "Recommended 6: sufficient bullet volume but impact statements are inconsistent and only one bullet demonstrates above-peer performance."
    }
  }
}

Current rank level: ${rankLevelValue}${
  guidanceBlock
    ? `\n\nOfficial Mark Descriptions by Category (use these to calibrate scores and aiExplanation):\n${guidanceBlock}`
    : ""
}

Categories and bullets:
${JSON.stringify(populatedCategories.map(([category, bullets]) => ({ category, bullets })), null, 2)}`;

    const completion = await client.chat.completions.create({
      model: DASHBOARD_ANALYSIS_MODEL,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 1200,
      temperature: 0.2,
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
    const parsed = JSON.parse(stripCodeFences(rawOutput)) as {
      evaluations?: CategoryEvaluations;
    };

    const evaluations = Object.fromEntries(
      populatedCategories.map(([category]) => {
        const evaluation = parsed.evaluations?.[category];

        if (!evaluation) {
          return [
            category,
            {
              breakdown: {
                impact: 1,
                leadershipLevel: 1,
                scopeOfResponsibility: 1,
                measurableResults: 1,
                initiative: 1,
                alignmentToCategory: 1,
              },
              aiExplanation: "AI could not score this category from the current bullets.",
              compiledScore: 4,
            },
          ];
        }

        const breakdown = {
          impact: clampScore(evaluation.breakdown?.impact),
          leadershipLevel: clampScore(evaluation.breakdown?.leadershipLevel),
          scopeOfResponsibility: clampScore(evaluation.breakdown?.scopeOfResponsibility),
          measurableResults: clampScore(evaluation.breakdown?.measurableResults),
          initiative: clampScore(evaluation.breakdown?.initiative),
          alignmentToCategory: clampScore(evaluation.breakdown?.alignmentToCategory),
        };

        return [
          category,
          {
            breakdown,
            aiExplanation:
              typeof evaluation.aiExplanation === "string" && evaluation.aiExplanation.trim()
                ? evaluation.aiExplanation.trim()
                : "AI could not generate an explanation for this category.",
            compiledScore: compileScoreFromBreakdown(breakdown),
          },
        ];
      })
    );

    logApiRequestMetadata({ requestId, routeName, inputLength, success: true, status: 200 });
    return Response.json({ evaluations });
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

    logApiError("Evaluate category quality error", error, { requestId, routeName, inputLength, success: false });
    logApiRequestMetadata({ requestId, routeName, inputLength, success: false, status: 500 });
    return Response.json(
      { error: "Unable to evaluate category quality right now. Please try again." },
      { status: 500 }
    );
  }
}