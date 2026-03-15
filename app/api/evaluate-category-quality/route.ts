import OpenAI from "openai";
import { requireSessionUser } from "@/lib/auth";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
  try {
    const { response: authResponse } = await requireSessionUser();
    if (authResponse) {
      return authResponse;
    }

    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: "Missing OPENAI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const { rankLevel, categories } = (await req.json()) as {
      rankLevel?: string;
      categories?: Record<string, string[]>;
    };

    if (!categories || typeof categories !== "object") {
      return Response.json(
        { error: "Missing categories to evaluate." },
        { status: 400 }
      );
    }

    const populatedCategories = Object.entries(categories).filter(
      ([, bullets]) => Array.isArray(bullets) && bullets.some((bullet) => bullet.trim())
    );

    if (populatedCategories.length === 0) {
      return Response.json({ evaluations: {} });
    }

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

Current rank level: ${rankLevel || "Not provided"}

Categories and bullets:
${JSON.stringify(populatedCategories.map(([category, bullets]) => ({ category, bullets })), null, 2)}`;

    const completion = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 1200,
      temperature: 0.2,
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

    return Response.json({ evaluations });
  } catch (error: unknown) {
    console.error("Evaluate category quality error:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Category quality evaluation failed.",
      },
      { status: 500 }
    );
  }
}