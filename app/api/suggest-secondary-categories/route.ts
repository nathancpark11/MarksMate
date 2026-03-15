import OpenAI from "openai";
import { requireSessionUser } from "@/lib/auth";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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
  try {
    const { response: authResponse } = await requireSessionUser();
    if (authResponse) return authResponse;

    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const { bullet, action, primaryCategory } = (await req.json()) as {
      bullet?: string;
      action?: string;
      primaryCategory?: string;
    };

    if (!bullet?.trim() || !action?.trim()) {
      return Response.json({ error: "Missing bullet or action." }, { status: 400 });
    }

    const otherCategories = CATEGORIES.filter((c) => c !== primaryCategory);

    const prompt = `You are analyzing a performance evaluation mark for a U.S. Coast Guard member.

GENERATED MARK: ${bullet}
ORIGINAL ACCOMPLISHMENT: ${action}
PRIMARY CATEGORY: ${primaryCategory ?? "Unknown"}

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
      return Response.json({
        hasAlternatives: parsed.hasAlternatives ?? false,
        categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      });
    } catch {
      return Response.json({ hasAlternatives: false, categories: [] });
    }
  } catch (err) {
    console.error("/api/suggest-secondary-categories error:", err);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}
