import OpenAI from "openai";
import { requireSessionUser } from "@/lib/auth";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function stripCodeFences(value: string) {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
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

    const { bulletsByCategory, memberName, rankLevel, unitName, periodStart, periodEnd, includeSections } =
      (await req.json()) as {
        bulletsByCategory?: Record<string, string[]>;
        memberName?: string;
        rankLevel?: string;
        unitName?: string;
        periodStart?: string;
        periodEnd?: string;
        includeSections?: {
          categorySummaries?: boolean;
          topAccomplishments?: boolean;
          achievementLog?: boolean;
          supervisorNotes?: boolean;
        };
      };

    const selectedSections = {
      categorySummaries: includeSections?.categorySummaries ?? true,
      topAccomplishments: includeSections?.topAccomplishments ?? true,
      achievementLog: includeSections?.achievementLog ?? true,
      supervisorNotes: includeSections?.supervisorNotes ?? true,
    };

    if (!bulletsByCategory || typeof bulletsByCategory !== "object") {
      return Response.json({ error: "Missing bullets." }, { status: 400 });
    }

    const hasBullets = Object.values(bulletsByCategory).some(
      (arr) => Array.isArray(arr) && arr.length > 0
    );

    if (!hasBullets) {
      return Response.json(
        { error: "No bullets found. Add bullets in the Generator first." },
        { status: 400 }
      );
    }

    const memberRef = memberName?.trim() || "the member";

    const prompt = `You are writing a performance marks package for a U.S. Coast Guard member.

Member: ${memberRef}
Rank Level: ${rankLevel || "Not specified"}
Unit: ${unitName || "Not specified"}
Reporting Period: ${periodStart || "start of period"} – ${periodEnd || "end of period"}

Bullets grouped by category:
${JSON.stringify(bulletsByCategory, null, 2)}

Return valid JSON only — no markdown, no code fences — with exactly this shape:
{
  "categorySummaries": [
    {
      "category": "Category Name",
      "summary": "2-3 sentence narrative paragraph summarizing performance in this category."
    }
  ],
  "topAccomplishments": [
    "bullet text 1",
    "bullet text 2"
  ],
  "supervisorNotes": "3-4 sentence paragraph."
}

Rules:
- Include sections only when requested:
  - categorySummaries: ${selectedSections.categorySummaries ? "include" : "omit and return []"}
  - topAccomplishments: ${selectedSections.topAccomplishments ? "include" : "omit and return []"}
  - achievementLog: ${selectedSections.achievementLog ? "not generated in API (handled by client)" : "not generated in API (handled by client)"}
  - supervisorNotes: ${selectedSections.supervisorNotes ? "include" : "omit and return an empty string"}
- categorySummaries: include ONLY categories that have bullets. Write in third person. Reference ${memberRef} by last name if a name was provided, otherwise use "the member". Cite specific measurable results from the bullets. Do not invent facts not present in the bullets.
- topAccomplishments: select the 5 most impactful bullets across all categories. Prioritize bullets with measurable results, quantified impact, and strong scope. Return the exact bullet text from the input — do not rewrite them.
- supervisorNotes: write 3-4 sentences a supervisor can copy directly into an evaluation. Use third person. Reference the member by last name if provided. Highlight dominant themes: leadership, initiative, mission impact. Avoid generic filler ("dedicated professional", "hard worker") — anchor every sentence to something from the bullets.`;

    const completion = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1800,
      temperature: 0.4,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "{}";
    const parsed = JSON.parse(stripCodeFences(raw)) as {
      categorySummaries?: { category: string; summary: string }[];
      topAccomplishments?: string[];
      supervisorNotes?: string;
    };

    return Response.json({
      categorySummaries: selectedSections.categorySummaries
        ? Array.isArray(parsed.categorySummaries)
          ? parsed.categorySummaries.filter(
              (s) => s && typeof s.category === "string" && typeof s.summary === "string"
            )
          : []
        : [],
      topAccomplishments: selectedSections.topAccomplishments
        ? Array.isArray(parsed.topAccomplishments)
          ? parsed.topAccomplishments.filter((s) => typeof s === "string")
          : []
        : [],
      supervisorNotes:
        selectedSections.supervisorNotes && typeof parsed.supervisorNotes === "string"
          ? parsed.supervisorNotes.trim()
          : "",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to build marks package.";
    console.error("build-marks-package error:", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
