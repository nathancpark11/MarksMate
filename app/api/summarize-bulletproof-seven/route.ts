import OpenAI from "openai";
import { parseLimitedJsonBody } from "@/lib/aiRequestGuards";
import { requireSessionUser } from "@/lib/auth";
import { isGuidanceAdminUsername } from "@/lib/admin";
import { getMarkDescriptionsForCategory } from "@/lib/officialGuidance";
import { validateCombinedAiInputs } from "@/lib/promptSpamGuard";
import { enforceRateLimits } from "@/lib/rateLimit";
import { getRequestId, logApiError, logApiRequestMetadata } from "@/lib/safeLogging";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "missing-openai-api-key",
});

const BULLETPROOF_SUMMARY_MODEL =
  process.env.OPENAI_MODEL_DASHBOARD_ANALYSIS ?? process.env.OPENAI_MODEL_STRONG ?? "gpt-4.1";

const SUMMARY_CHAR_LIMIT = 250;

const APPROVED_ABBREVIATIONS =
  "additional=add'l, administration=admin, and=&, area of responsibility=AOR, command=cmd, communication=comms, coordinate(d)=coord, department=dept, discrepancies=discreps, hours=hrs, identify/identified=ID/ID's, in support of=ISO, included=incl('d), increased=incr('d), knowledge=knwlg, law enforcement=LE, leadership=ldrshp, level=lvl, management=mgmnt, member=Mbr/SVM/ROM, operations=ops, opportunity=oppty, package(s)=pkg(s), performance=perf, professional=prof'l, project=proj, quarter/quarterly=qtr/qtrl'y, recommendation=recomd, required=req'd, search and rescue=SAR, service=svs/Svs, subject matter specialist=SME, technical=tech'l, thousand=K, through=thru, training=trng, vessel=vsl, weather=wx, with regard to=wrt";

function stripCodeFences(value: string) {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function clampSummaryLength(value: string, maxChars = SUMMARY_CHAR_LIMIT) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  const truncated = normalized.slice(0, maxChars - 3).trimEnd();
  return `${truncated}...`;
}

function fallbackSummary(category: string) {
  return clampSummaryLength(
    `${category}: sustained superior perf with measurable mission impact, proactive initiative, and influence across the team; evidence aligns with top-tier standards across official mark criteria.`
  );
}

export async function POST(req: Request) {
  const routeName = "/api/summarize-bulletproof-seven";
  const requestId = getRequestId(req);
  let inputLength = 0;

  try {
    const { user, response: authResponse } = await requireSessionUser();
    if (authResponse || !user) {
      return authResponse ?? Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isGuidanceAdminUsername(user.username)) {
      const rateLimitResponse = enforceRateLimits(req, [
        {
          key: "bulletproof-seven-summary-per-hour",
          maxRequests: 6,
          windowMs: 60 * 60 * 1000,
          errorMessage: "Hourly rate limit reached for Bulletproof 7 summary generation.",
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
    }>(req);
    inputLength = parsedBody.bodyBytes;
    if (!parsedBody.ok) {
      logApiRequestMetadata({
        requestId,
        routeName,
        inputLength,
        success: false,
        status: parsedBody.response.status,
      });
      return parsedBody.response;
    }

    const rankLevel =
      typeof parsedBody.data.rankLevel === "string" && parsedBody.data.rankLevel.trim()
        ? parsedBody.data.rankLevel.trim()
        : "E5";

    const categoriesInput = parsedBody.data.categories;
    if (!categoriesInput || typeof categoriesInput !== "object") {
      return Response.json({ error: "Missing category data." }, { status: 400 });
    }

    const normalizedCategoryEntries = Object.entries(categoriesInput)
      .map(([category, bullets]) => {
        const cleanCategory = typeof category === "string" ? category.trim() : "";
        const cleanBullets = Array.isArray(bullets)
          ? bullets
              .filter((bullet): bullet is string => typeof bullet === "string")
              .map((bullet) => bullet.trim())
              .filter(Boolean)
          : [];
        return [cleanCategory, cleanBullets] as const;
      })
      .filter(([category, bullets]) => category.length > 0 && bullets.length > 0);

    if (normalizedCategoryEntries.length === 0) {
      return Response.json({ summaries: {} });
    }

    const promptSpamError = validateCombinedAiInputs(
      normalizedCategoryEntries.flatMap(([category, bullets]) => [category, ...bullets])
    );
    if (promptSpamError) {
      return Response.json({ error: promptSpamError }, { status: 400 });
    }

    const categoryMarkDescriptions: Record<string, string> = {};
    await Promise.all(
      normalizedCategoryEntries.map(async ([category]) => {
        const descriptions = await getMarkDescriptionsForCategory({
          category,
          rankLevel,
          maxChunks: 4,
        });
        if (descriptions) {
          categoryMarkDescriptions[category] = descriptions;
        }
      })
    );

    const prompt = `You are generating a compact U.S. Coast Guard evaluation summary called "Bulletproof 7".

Task:
- For each category, consolidate the provided official marks (bullets) into one summary representing mark-level 7 performance.

Hard requirements:
- Return valid JSON only using this shape: {"summaries":{"Category":"summary text"}}
- Each summary must be one sentence and at most ${SUMMARY_CHAR_LIMIT} characters INCLUDING spaces.
- Do not exceed ${SUMMARY_CHAR_LIMIT} chars for any category.
- Keep language specific, impact-focused, and mission-oriented.
- Do not invent metrics, facts, or outcomes.
- Prefer approved Coast Guard abbreviations where they fit naturally.

Approved Abbreviations:
${APPROVED_ABBREVIATIONS}

Rank Level: ${rankLevel}

Category inputs (with bullets and official mark descriptions):
${JSON.stringify(
  normalizedCategoryEntries.map(([category, bullets]) => ({
    category,
    bullets,
    officialMarkDescriptions: categoryMarkDescriptions[category] || "",
  })),
  null,
  2
)}
`;

    const completion = await client.chat.completions.create({
      model: BULLETPROOF_SUMMARY_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 900,
      temperature: 0.2,
    });

    const rawOutput = completion.choices[0]?.message?.content?.trim() || "{}";
    const parsed = JSON.parse(stripCodeFences(rawOutput)) as {
      summaries?: Record<string, string>;
    };

    const summaries = Object.fromEntries(
      normalizedCategoryEntries.map(([category]) => {
        const generated = typeof parsed.summaries?.[category] === "string" ? parsed.summaries[category] : "";
        const normalized = clampSummaryLength(generated);
        return [category, normalized || fallbackSummary(category)];
      })
    );

    logApiRequestMetadata({ requestId, routeName, inputLength, success: true, status: 200 });
    return Response.json({ summaries });
  } catch (error: unknown) {
    logApiError("Summarize bulletproof seven error", error, {
      requestId,
      routeName,
      inputLength,
      success: false,
    });
    logApiRequestMetadata({ requestId, routeName, inputLength, success: false, status: 500 });
    return Response.json(
      { error: "Unable to generate Bulletproof 7 summaries right now. Please try again." },
      { status: 500 }
    );
  }
}
