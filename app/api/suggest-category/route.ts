import OpenAI from "openai";
import { parseLimitedJsonBody } from "@/lib/aiRequestGuards";
import { requireSessionUser } from "@/lib/auth";
import { validateSingleAiInput } from "@/lib/promptSpamGuard";
import { enforceRateLimits } from "@/lib/rateLimit";
import { getRequestId, logApiError, logApiRequestMetadata } from "@/lib/safeLogging";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "missing-openai-api-key",
});

export async function POST(req: Request) {
  const routeName = "/api/suggest-category";
  const requestId = getRequestId(req);
  let inputLength = 0;

  try {
    const { response: authResponse } = await requireSessionUser();
    if (authResponse) {
      return authResponse;
    }

    const rateLimitResponse = enforceRateLimits(req, [
      {
        key: "suggest-category-per-hour",
        maxRequests: 30,
        windowMs: 60 * 60 * 1000,
        errorMessage: "Hourly rate limit reached for category suggestion.",
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

    const parsedBody = await parseLimitedJsonBody<{ text?: unknown }>(req);
    inputLength = parsedBody.bodyBytes;
    if (!parsedBody.ok) {
      logApiRequestMetadata({ requestId, routeName, inputLength, success: false, status: parsedBody.response.status });
      return parsedBody.response;
    }

    const { text } = parsedBody.data;

    if (typeof text !== "string" || !text.trim()) {
      return Response.json({ error: "Missing text to classify." }, { status: 400 });
    }

    const promptSpamError = validateSingleAiInput(text);
    if (promptSpamError) {
      return Response.json({ error: promptSpamError }, { status: 400 });
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

Return a JSON object ONLY with keys "category" and "reason", for example: {"category":"Quality of Work","reason":"Because..."}.

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
      logApiRequestMetadata({ requestId, routeName, inputLength, success: true, status: 200 });
      return Response.json({ category: parsed.category, reason: parsed.reason });
    } catch {
      logApiRequestMetadata({ requestId, routeName, inputLength, success: true, status: 200 });
      return Response.json({ category: output.trim(), reason: "" });
    }
  } catch (error: unknown) {
    logApiError("Suggest category error", error, { requestId, routeName, inputLength, success: false });
    logApiRequestMetadata({ requestId, routeName, inputLength, success: false, status: 500 });
    return Response.json(
      { error: "Unable to suggest a category right now. Please try again." },
      { status: 500 }
    );
  }
}
