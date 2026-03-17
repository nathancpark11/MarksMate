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
  const routeName = "/api/summarize-action";
  const requestId = getRequestId(req);
  let inputLength = 0;

  try {
    const { response: authResponse } = await requireSessionUser();
    if (authResponse) {
      return authResponse;
    }

    const rateLimitResponse = enforceRateLimits(req, [
      {
        key: "summarize-action-per-hour",
        maxRequests: 30,
        windowMs: 60 * 60 * 1000,
        errorMessage: "Hourly rate limit reached for action summary.",
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
      return Response.json({ error: "Missing text to summarize." }, { status: 400 });
    }

    const promptSpamError = validateSingleAiInput(text);
    if (promptSpamError) {
      return Response.json({ error: promptSpamError }, { status: 400 });
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

    logApiRequestMetadata({ requestId, routeName, inputLength, success: true, status: 200 });
    return Response.json({ summary });
  } catch (error: unknown) {
    logApiError("Summarize action error", error, { requestId, routeName, inputLength, success: false });
    logApiRequestMetadata({ requestId, routeName, inputLength, success: false, status: 500 });
    return Response.json(
      { error: "Unable to summarize text right now. Please try again." },
      { status: 500 }
    );
  }
}