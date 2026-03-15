import OpenAI from "openai";
import { requireSessionUser } from "@/lib/auth";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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

    const { accomplishment, bullet } = await req.json();

    if (!accomplishment || !accomplishment.trim()) {
      return Response.json({ error: "Missing accomplishment to review." }, { status: 400 });
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
${bullet || "Not provided"}`;

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
      return Response.json({
        recommendation: {
          shouldSplit: false,
          reason: "Recommendation unavailable.",
          splitActions: [],
        },
      });
    }
  } catch (error: unknown) {
    console.error("Recommend bullet split error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Split recommendation request failed." },
      { status: 500 }
    );
  }
}