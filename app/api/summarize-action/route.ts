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
      return Response.json({ error: "Missing text to summarize." }, { status: 400 });
    }

    const prompt = `Summarize the main action or accomplishment in this performance evaluation bullet into 2-3 words. Return only the summary, no quotes or extra text.

Bullet: ${text}`;

    const completion = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 50,
      temperature: 0.3,
    });

    const summary = completion.choices[0]?.message?.content?.trim() || "Summary unavailable";

    return Response.json({ summary });
  } catch (error: unknown) {
    console.error("Summarize action error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Summary request failed." },
      { status: 500 }
    );
  }
}