import OpenAI from "openai";
import { requireSessionUser } from "@/lib/auth";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

    const { text } = await req.json();

    if (!text || !text.trim()) {
      return Response.json({ error: "Missing text to classify." }, { status: 400 });
    }

    const categories = [
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

    const prompt = `You are given a single performance evaluation bullet. Choose the single best category from the following list: ${categories.join(
      ", "
    )}.

Return a JSON object ONLY with keys "category" and "reason", for example: {"category":"Leadership","reason":"Because..."}.

Bullet:\n${text}`;

    const completion = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 150,
      temperature: 0.3,
    });

    const output = completion.choices[0]?.message?.content || "";

    try {
      const parsed = JSON.parse(output.trim()) as { category?: string; reason?: string };
      return Response.json({ category: parsed.category, reason: parsed.reason });
    } catch {
      return Response.json({ category: output.trim(), reason: "" });
    }
  } catch (error: unknown) {
    console.error("Suggest category error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Suggestion request failed." },
      { status: 500 }
    );
  }
}
