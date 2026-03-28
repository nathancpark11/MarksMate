import OpenAI from "openai";
import { parseLimitedJsonBody } from "@/lib/aiRequestGuards";
import { requireSessionUser } from "@/lib/auth";
import { logAiUsageEvent } from "@/lib/analytics/logging";
import { isGuidanceAdminUsername } from "@/lib/admin";
import { validateCombinedAiInputs } from "@/lib/promptSpamGuard";
import { enforceRateLimits } from "@/lib/rateLimit";
import { getRequestId, logApiError, logApiRequestMetadata } from "@/lib/safeLogging";
import { getMarkDescriptionsForCategory } from "@/lib/officialGuidance";
import { enforcePremiumFeatureAccess } from "@/lib/usageLimits";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "missing-openai-api-key",
});

const DASHBOARD_ANALYSIS_MODEL = process.env.OPENAI_MODEL_DASHBOARD_ANALYSIS ?? process.env.OPENAI_MODEL_STRONG ?? "gpt-4.1";
const DASHBOARD_INPUT_GUARD_LIMITS = {
  maxItems: 240,
  maxCombinedChars: 40000,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeCategoryKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pickEvaluationsNode(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) {
    return {};
  }

  if (isRecord(payload.evaluations)) {
    return payload.evaluations;
  }

  if (Array.isArray(payload.evaluations)) {
    const entries = payload.evaluations
      .map((entry) => {
        if (!isRecord(entry) || typeof entry.category !== "string") {
          return null;
        }

        const value = isRecord(entry.evaluation)
          ? entry.evaluation
          : {
              breakdown: entry.breakdown,
              aiExplanation: entry.aiExplanation,
              compiledScore: entry.compiledScore,
            };

        return [entry.category, value] as const;
      })
      .filter((entry): entry is readonly [string, Record<string, unknown>] => Boolean(entry && isRecord(entry[1])));

    return Object.fromEntries(entries);
  }

  return payload;
}

function parseCategoryEvaluationPayload(rawOutput: string) {
  const sanitized = stripCodeFences(rawOutput);
  const candidates = [sanitized];

  const firstBrace = sanitized.indexOf("{");
  const lastBrace = sanitized.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(sanitized.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      return {
        evaluations: pickEvaluationsNode(parsed),
        parsed: true,
      };
    } catch {
      // Try the next candidate.
    }
  }

  return {
    evaluations: {} as Record<string, unknown>,
    parsed: false,
  };
}

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

function getUnavailableEvaluation(reason: string) {
  return {
    breakdown: {
      impact: 1,
      leadershipLevel: 1,
      scopeOfResponsibility: 1,
      measurableResults: 1,
      initiative: 1,
      alignmentToCategory: 1,
    },
    aiExplanation: reason,
    compiledScore: 4,
  };
}

function buildHeuristicEvaluation(bullets: string[]) {
  const normalizedBullets = bullets
    .map((bullet) => (typeof bullet === "string" ? bullet.trim() : ""))
    .filter(Boolean);

  const bulletCount = normalizedBullets.length;
  const measurableCount = normalizedBullets.filter((bullet) => /\b\d+(?:\.\d+)?%?\b|\$\d|\b(increased|decreased|reduced|improved|saved)\b/i.test(bullet)).length;
  const leadershipCount = normalizedBullets.filter((bullet) => /\b(led|mentored|trained|supervised|managed|coached|directed)\b/i.test(bullet)).length;
  const initiativeCount = normalizedBullets.filter((bullet) => /\b(initiated|developed|created|implemented|volunteered|proposed|improved)\b/i.test(bullet)).length;
  const scopeCount = normalizedBullets.filter((bullet) => /\b(team|section|shop|flight|squadron|unit|mission|program|project)\b/i.test(bullet)).length;

  const countBase = Math.min(10, Math.max(2, 2 + bulletCount * 2));

  const breakdown = {
    impact: clampScore(countBase + (measurableCount > 0 ? 1 : 0)),
    leadershipLevel: clampScore(countBase - 1 + (leadershipCount > 0 ? 2 : 0)),
    scopeOfResponsibility: clampScore(countBase - 1 + (scopeCount > 0 ? 1 : 0)),
    measurableResults: clampScore(countBase - 2 + Math.min(3, measurableCount)),
    initiative: clampScore(countBase - 1 + (initiativeCount > 0 ? 2 : 0)),
    alignmentToCategory: clampScore(countBase),
  };

  const compiledScore = compileScoreFromBreakdown(breakdown);
  const roundedRecommendation = Math.min(7, Math.max(4, Math.round(compiledScore)));

  const explanation =
    `Recommended ${roundedRecommendation}: fallback scoring used from current bullet evidence with ${bulletCount} bullet${bulletCount === 1 ? "" : "s"}, ` +
    `${measurableCount} measurable result${measurableCount === 1 ? "" : "s"}, and ${leadershipCount} leadership indicator${leadershipCount === 1 ? "" : "s"}.`;

  return {
    breakdown,
    aiExplanation: explanation,
    compiledScore,
  };
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
      feature?: string;
    }>(req);
    inputLength = parsedBody.bodyBytes;
    if (!parsedBody.ok) {
      logApiRequestMetadata({ requestId, routeName, inputLength, success: false, status: parsedBody.response.status });
      return parsedBody.response;
    }

    const { rankLevel, categories, feature } = parsedBody.data;

    if (feature === "export") {
      const premiumAccess = await enforcePremiumFeatureAccess(user.id, "Export");
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
    }

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
        try {
          const descriptions = await getMarkDescriptionsForCategory({
            category,
            rankLevel: rankLevelValue,
            maxChunks: 4,
          });
          if (descriptions) {
            categoryMarkDescriptions[category] = descriptions;
          }
        } catch (guidanceError: unknown) {
          // Guidance context is optional for scoring; keep the request alive if lookup fails.
          logApiError("Evaluate category quality guidance lookup error", guidanceError, {
            requestId,
            routeName,
            category,
            inputLength,
          });
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

    let rawOutput = "{}";
    try {
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

      rawOutput = completion.choices[0]?.message?.content?.trim() || "{}";
    } catch (aiError: unknown) {
      await logAiUsageEvent({
        userId: user.id,
        endpoint: routeName,
        model: DASHBOARD_ANALYSIS_MODEL,
        success: false,
        errorMessage: aiError instanceof Error ? aiError.message : "Unknown AI completion error",
      });

      logApiError("Evaluate category quality completion error", aiError, {
        requestId,
        routeName,
        inputLength,
      });

      const evaluations = Object.fromEntries(
        populatedCategories.map(([category, bullets]) => [
          category,
          buildHeuristicEvaluation(bullets),
        ])
      );

      logApiRequestMetadata({ requestId, routeName, inputLength, success: true, status: 200 });
      return Response.json({ evaluations, degraded: true });
    }
    const { evaluations: parsedEvaluations, parsed } = parseCategoryEvaluationPayload(rawOutput);

    if (!parsed) {
      // Do not fail the endpoint when AI returns malformed JSON; fall back to per-category defaults.
      logApiError("Evaluate category quality parse error", new Error("Failed to parse AI response JSON"), {
        requestId,
        routeName,
        inputLength,
        rawOutputPreview: rawOutput.slice(0, 500),
      });
    }

    const normalizedEvaluationEntries = Object.entries(parsedEvaluations).map(([category, evaluation]) => [
      normalizeCategoryKey(category),
      evaluation,
    ] as const);
    const evaluationsByNormalizedCategory = new Map<string, unknown>(normalizedEvaluationEntries);

    const evaluations = Object.fromEntries(
      populatedCategories.map(([category, bullets]) => {
        const evaluationCandidate =
          parsedEvaluations[category] ?? evaluationsByNormalizedCategory.get(normalizeCategoryKey(category));

        const evaluation = isRecord(evaluationCandidate) ? evaluationCandidate : null;

        if (!evaluation) {
          return [category, buildHeuristicEvaluation(bullets)];
        }

        const breakdown = {
          impact: clampScore(isRecord(evaluation.breakdown) ? evaluation.breakdown.impact : undefined),
          leadershipLevel: clampScore(
            isRecord(evaluation.breakdown) ? evaluation.breakdown.leadershipLevel : undefined
          ),
          scopeOfResponsibility: clampScore(
            isRecord(evaluation.breakdown) ? evaluation.breakdown.scopeOfResponsibility : undefined
          ),
          measurableResults: clampScore(
            isRecord(evaluation.breakdown) ? evaluation.breakdown.measurableResults : undefined
          ),
          initiative: clampScore(isRecord(evaluation.breakdown) ? evaluation.breakdown.initiative : undefined),
          alignmentToCategory: clampScore(
            isRecord(evaluation.breakdown) ? evaluation.breakdown.alignmentToCategory : undefined
          ),
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