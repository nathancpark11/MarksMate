import OpenAI from "openai";
import { requireSessionUser } from "@/lib/auth";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function extractNumbers(value: string) {
  return value.match(/\b\d+(?:\.\d+)?%?\b/g) || [];
}

function normalizeNumber(value: string) {
  return value.toLowerCase();
}

export async function POST(req: Request) {
  try {
    const { response: authResponse } = await requireSessionUser();
    if (authResponse) {
      return authResponse;
    }

    const { action } = (await req.json()) as { action?: string };
    const actionText = (action || "").trim();

    if (!actionText) {
      return Response.json({ error: "Missing action text." }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return Response.json({
        impact: "Improved mission execution, readiness, and team effectiveness through repeated, measurable effort.",
      });
    }

    const prompt = `You are writing a specific recommended impact statement for a U.S. military evaluation entry.

Action text:
${actionText}

Rules:
- Return only one impact sentence.
- Prioritize measurable and mission-focused outcomes.
- Include numbers only when they already appear in the action text.
- Never invent, estimate, or infer new numeric values, percentages, counts, or durations.
- If the action text has no numbers, do not include any numbers in the impact sentence.
- Be specific and concise.
- Do not include labels, bullets, or quotes.`;

    const completion = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 120,
    });

    const generatedImpact =
      completion.choices[0]?.message?.content?.trim() ||
      "Improved mission outcomes through consistent execution and measurable team impact.";

    const sourceNumbers = new Set(extractNumbers(actionText).map(normalizeNumber));
    const impactNumbers = extractNumbers(generatedImpact).map(normalizeNumber);

    const hasInventedNumbers = impactNumbers.some((value) => !sourceNumbers.has(value));

    const impact = hasInventedNumbers
      ? sourceNumbers.size > 0
        ? "Improved mission outcomes aligned to the documented actions and reported measurable results."
        : "Improved mission outcomes through consistent execution and measurable team impact."
      : generatedImpact;

    return Response.json({ impact });
  } catch (error: unknown) {
    console.error("suggest-impact error", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to suggest impact." },
      { status: 500 }
    );
  }
}