import OpenAI from "openai";
import { logAiUsageEvent } from "@/lib/analytics/logging";
import { requireSessionUser } from "@/lib/auth";
import { validateCombinedAiInputs } from "@/lib/promptSpamGuard";
import { enforceRateLimits } from "@/lib/rateLimit";
import { getRequestId, logApiError, logApiRequestMetadata } from "@/lib/safeLogging";
import { getCategorySpecificGuidanceContext } from "@/lib/officialGuidance";
import { enforceGenerationAccess, enforcePremiumFeatureAccess, incrementDailyGenerationUsage } from "@/lib/usageLimits";
import {
  GENERATE_REQUEST_MAX_BYTES,
  getUtf8ByteLength,
  validateActionAndImpact,
} from "@/lib/generationValidation";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "missing-openai-api-key",
});

const SIMPLE_MODEL = process.env.OPENAI_MODEL_SIMPLE ?? "gpt-4.1-mini";
const STRONG_MODEL = process.env.OPENAI_MODEL_STRONG ?? "gpt-4.1";
const FINAL_MARK_MODEL = process.env.OPENAI_MODEL_FINAL_MARK ?? STRONG_MODEL;
const VAGUE_ENTRY_MODEL = process.env.OPENAI_MODEL_VAGUE_ENTRY ?? STRONG_MODEL;

function isLikelyVagueAccomplishment(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) {
    return true;
  }

  const words = text.split(" ").filter(Boolean);
  const wordCount = words.length;
  const hasQuantifier = /\d|%|percent|hours?|hrs?|days?|weeks?|months?/i.test(text);
  const hasStrongVerb =
    /\b(led|managed|coordinated|trained|developed|implemented|executed|improved|reduced|increased|organized|supervised|resolved|delivered|planned|directed|analyzed)\b/i.test(
      text
    );
  const hasVagueLanguage = /\b(helped|worked on|assisted|supported|did|handled things)\b/i.test(text);

  return wordCount < 9 || (!hasQuantifier && (!hasStrongVerb || hasVagueLanguage));
}

function getCategoryGuidance(category: string) {
  switch (category) {
    case "Military Bearing":
      return "Emphasize appearance, conduct, discipline, and adherence to military standards.";
    case "Customs, Courtesies and Traditions":
      return "Emphasize respect for traditions, proper salutes, courtesies, and military etiquette.";
    case "Quality of Work":
      return "Emphasize accuracy, thoroughness, attention to detail, and high-quality output.";
    case "Technical Proficiency":
      return "Emphasize skill mastery, expertise in duties, and technical competence.";
    case "Initiative":
      return "Emphasize self-motivation, proactive actions, and taking charge without direction.";
    case "Decision Making and Problem Solving":
      return "Emphasize sound judgment, analytical thinking, and effective problem resolution.";
    case "Military Readiness":
      return "Emphasize preparedness, training, equipment maintenance, and mission readiness.";
    case "Self Awareness and Learning":
      return "Emphasize personal growth, learning from experiences, and self-improvement.";
    case "Team Building":
      return "Emphasize fostering unity, morale, cohesion, and team spirit.";
    case "Respect for Others":
      return "Emphasize treating others with dignity, fairness, and consideration.";
    case "Accountability and Responsibility":
      return "Emphasize reliability, ownership of actions, and fulfilling obligations.";
    case "Influencing Others":
      return "Emphasize persuasion, leadership influence, and motivating subordinates.";
    case "Effective Communication":
      return "Emphasize clear expression, listening skills, and effective information exchange.";
    default:
      return "Emphasize strong performance and measurable impact.";
  }
}

function getRankGuidance(rankLevel: string) {
  if (["E1", "E2", "E3"].includes(rankLevel)) {
    return "Use language appropriate for an early-career service member. Highlight dependability, growth, initiative, execution, and contribution to the team.";
  }

  if (["E4", "E5", "E6"].includes(rankLevel)) {
    return "Use language appropriate for a frontline supervisor. Highlight leadership, accountability, training, ownership, and mission execution.";
  }

  if (["E7", "E8", "E9"].includes(rankLevel)) {
    return "Use language appropriate for a senior enlisted leader. Highlight strategic influence, mentorship, readiness, standards, and organizational impact.";
  }

  switch (rankLevel) {
    case "Junior Enlisted":
      return "Use language appropriate for an early-career service member. Highlight dependability, growth, initiative, execution, and contribution to the team.";
    case "Petty Officer / NCO":
      return "Use language appropriate for a frontline supervisor. Highlight leadership, accountability, training, ownership, and mission execution.";
    case "Senior Enlisted":
      return "Use language appropriate for a senior enlisted leader. Highlight strategic influence, mentorship, readiness, standards, and organizational impact.";
    case "Officer":
      return "Use language appropriate for an officer. Highlight planning, decision-making, resource management, leadership, and mission outcomes.";
    default:
      return "Match the tone to the member’s level of responsibility.";
  }
}

function parseGeneratedResult(rawContent: string) {
  const trimmed = rawContent.trim();

  try {
    const parsed = JSON.parse(trimmed) as { bullet?: unknown; title?: unknown };
    if (typeof parsed.bullet === "string" && typeof parsed.title === "string") {
      return {
        bullet: parsed.bullet.trim(),
        title: parsed.title.trim(),
      };
    }
  } catch {
    // Fall back to extracting from a labeled plain-text response.
  }

  const bulletMatch = trimmed.match(/bullet\s*:\s*(.+)/i);
  const titleMatch = trimmed.match(/title\s*:\s*(.+)/i);

  return {
    bullet: bulletMatch?.[1]?.trim() ?? trimmed,
    title: titleMatch?.[1]?.trim() ?? "",
  };
}

function normalizeComparableBullet(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[-*•\s]+/, "")
    .replace(/[“”"']/g, "")
    .replace(/[.;:,!?]+$/g, "")
    .replace(/\s+/g, " ");
}

function estimateTokenCountFromText(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return 0;
  }

  return Math.max(1, Math.round(normalized.length / 4));
}

export async function POST(req: Request) {
  const routeName = "/api/generate";
  const requestId = getRequestId(req);
  let inputLength = 0;
  let userIdForLogging: string | null = null;
  let selectedModelForLogging: string | null = null;

  try {
    const { user, response: authResponse } = await requireSessionUser();
    if (authResponse) {
      return authResponse;
    }
    userIdForLogging = user.id;

    const generationAccess = await enforceGenerationAccess(user.id);
    if (!generationAccess.allowed) {
      return Response.json(
        {
          error: generationAccess.reason,
          code: generationAccess.code,
          usage: generationAccess.summary,
        },
        { status: 403 }
      );
    }

    const rateLimitResponse = enforceRateLimits(req, [
      {
        key: "generate-per-minute",
        maxRequests: 5,
        windowMs: 60_000,
        errorMessage: "Rate limit reached for Generate Mark.",
      },
      {
        key: "generate-per-hour",
        maxRequests: 40,
        windowMs: 60 * 60 * 1000,
        errorMessage: "Hourly rate limit reached for Generate Mark.",
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

    const contentLengthHeader = req.headers.get("content-length");
    if (contentLengthHeader) {
      const parsedContentLength = Number(contentLengthHeader);
      if (Number.isFinite(parsedContentLength) && parsedContentLength > GENERATE_REQUEST_MAX_BYTES) {
        logApiRequestMetadata({
          requestId,
          routeName,
          inputLength: parsedContentLength,
          success: false,
          status: 413,
        });
        return Response.json(
          {
            error: `Request body exceeds ${GENERATE_REQUEST_MAX_BYTES} bytes. Please shorten your Action/Impact text.`,
          },
          { status: 413 }
        );
      }
    }

    const rawBody = await req.text();
    const bodyBytes = getUtf8ByteLength(rawBody);
    inputLength = bodyBytes;
    if (bodyBytes > GENERATE_REQUEST_MAX_BYTES) {
      logApiRequestMetadata({ requestId, routeName, inputLength, success: false, status: 413 });
      return Response.json(
        {
          error: `Request body exceeds ${GENERATE_REQUEST_MAX_BYTES} bytes. Please shorten your Action/Impact text.`,
        },
        { status: 413 }
      );
    }

    const {
      accomplishment,
      category,
      rankLevel,
      rating,
      bulletStyle,
      peopleAffected,
      percentImproved,
      hoursSaved,
      missionImpact,
      useAbbreviations,
      generationIntent,
      sourceBullet,
      sourceCategory,
    } = JSON.parse(rawBody) as {
      accomplishment?: unknown;
      category?: unknown;
      rankLevel?: unknown;
      rating?: unknown;
      bulletStyle?: unknown;
      peopleAffected?: unknown;
      percentImproved?: unknown;
      hoursSaved?: unknown;
      missionImpact?: unknown;
      useAbbreviations?: unknown;
      generationIntent?: unknown;
      sourceBullet?: unknown;
      sourceCategory?: unknown;
    };

    const accomplishmentValue = typeof accomplishment === "string" ? accomplishment : "";
    const missionImpactValue = typeof missionImpact === "string" ? missionImpact : "";

    const validationError = validateActionAndImpact(accomplishmentValue, missionImpactValue);
    if (validationError) {
      logApiRequestMetadata({ requestId, routeName, inputLength, success: false, status: 400 });
      return Response.json({ error: validationError }, { status: 400 });
    }

    const promptSpamError = validateCombinedAiInputs([accomplishmentValue, missionImpactValue]);
    if (promptSpamError) {
      logApiRequestMetadata({ requestId, routeName, inputLength, success: false, status: 400 });
      return Response.json({ error: promptSpamError }, { status: 400 });
    }

    const normalizedAccomplishment = accomplishmentValue.trim();
    const normalizedMissionImpact = missionImpactValue.trim();

    const categoryValue = typeof category === "string" && category ? category : "Quality of Work";
    const rankValue = typeof rankLevel === "string" && rankLevel ? rankLevel : "E4";
    const ratingValue = typeof rating === "string" && rating ? rating : "Undesignated";
    const isUserPremium = generationAccess.summary?.premium ?? false;
    const bulletStyleValue = isUserPremium
      ? (typeof bulletStyle === "string" && bulletStyle ? bulletStyle : "Standard")
      : "Short/Concise";
    const peopleAffectedValue =
      typeof peopleAffected === "string" && peopleAffected ? peopleAffected : "";
    const percentImprovedValue =
      typeof percentImproved === "string" && percentImproved ? percentImproved : "";
    const hoursSavedValue = typeof hoursSaved === "string" && hoursSaved ? hoursSaved : "";
    const useAbbreviationsValue =
      typeof useAbbreviations === "boolean" ? useAbbreviations : true;
    const generationIntentValue =
      typeof generationIntent === "string" && generationIntent ? generationIntent : "";
    const sourceBulletValue = typeof sourceBullet === "string" ? sourceBullet.trim() : "";
    const sourceCategoryValue = typeof sourceCategory === "string" ? sourceCategory.trim() : "";
    const isAlternateCategoryRewrite = generationIntentValue === "alternate-category-rewrite";
    const isRewordForCategory = generationIntentValue === "reword-for-category";
    const isPremiumGenerationIntent = isAlternateCategoryRewrite || isRewordForCategory;

    if (isPremiumGenerationIntent) {
      const premiumAccess = await enforcePremiumFeatureAccess(user.id, "Refine and improve");
      if (!premiumAccess.allowed) {
        return Response.json(
          {
            error: premiumAccess.reason,
            code: premiumAccess.code,
            usage: premiumAccess.summary,
          },
          { status: 403 }
        );
      }
    }

    const categoryGuidance = getCategoryGuidance(categoryValue);
    const rankGuidance = getRankGuidance(rankValue);
    const isVagueEntry = isLikelyVagueAccomplishment(normalizedAccomplishment);
    const selectedModel =
      user?.isGuest
        ? SIMPLE_MODEL
        : generationIntentValue === "final-polished-official-mark" || isAlternateCategoryRewrite || isRewordForCategory
          ? FINAL_MARK_MODEL
          : isVagueEntry
            ? VAGUE_ENTRY_MODEL
            : SIMPLE_MODEL;
        selectedModelForLogging = selectedModel;
    const impactInclusionRule = normalizedMissionImpact
      ? "- If mission impact is provided, explicitly include that impact in the bullet."
      : "- If mission impact is not provided, infer impact only from other provided data.";
    const { context: officialGuidanceContext, sections: officialGuidanceSections } = user?.isGuest
      ? { context: "", sections: [] as string[] }
      : await getCategorySpecificGuidanceContext({
          accomplishment: normalizedAccomplishment,
          missionImpact: normalizedMissionImpact,
          category: categoryValue,
          rankLevel: rankValue,
          rating: ratingValue,
          maxChunks: 1,
        });

    const supportingData = `
Supporting Data:
- People affected: ${peopleAffectedValue || "Not provided"}
- Percent improved: ${percentImprovedValue || "Not provided"}
- Hours saved: ${hoursSavedValue || "Not provided"}
- Mission impact: ${normalizedMissionImpact || "Not provided"}
`;

    const alternateCategoryRewriteContext = isAlternateCategoryRewrite
      ? `
Rewrite Context:
- You are rewriting an existing mark so the same accomplishment fits a different evaluation category.
- Target category: ${categoryValue}
- Original/source category: ${sourceCategoryValue || "Not provided"}
- Existing/source bullet: ${sourceBulletValue || "Not provided"}

Alternate-category rewrite rules:
- Preserve the underlying accomplishment and any real measurable impact.
- Reframe the bullet so the emphasis, wording, and evidence clearly support the target category.
- Do not copy or lightly paraphrase the existing/source bullet.
- The new bullet must be materially different in phrasing and angle from the existing/source bullet.
`
      : "";

    const rewordForCategoryContext = isRewordForCategory
      ? `
Reword Context:
- You are rewriting an existing mark to better fit its assigned evaluation category.
- Category: ${categoryValue}
- Existing bullet: ${sourceBulletValue || "Not provided"}

Reword rules:
- Preserve all real accomplishments, numbers, and measurable impact from the existing bullet.
- Strengthen the wording so the bullet clearly demonstrates evidence for the assigned category.
- Improve action verbs, tighten phrasing, and eliminate filler.
- Do not copy the existing bullet verbatim — the reword must produce a meaningfully improved version.
`
      : "";

    const abbreviationsGuidance = useAbbreviationsValue
  ? `
- When writing the bullet, prioritize the following approved Coast Guard abbreviations where appropriate:

Approved Abbreviations:
additional=add'l, administration=admin, administrative separation=ADSEP, advancement list=adv lst, and=&, approved=appvd, area of responsibility=AOR, air station=airsta/A/S, attention=attn, auxiliary=aux, between=btwn, building=bld, Captain of the Port=COTP, certification=cert, chief petty officer=CPO, civilian=civ, Coast Guard=CG, command=cmd, Command Duty Officer=CDO, Command Master Chief=CMC, Commandant (office)=Comdt, Commandant (person)=CCG, Commanding Officer=CO, communication=comms, conference=conf, coordinate(d)=coord, demonstrate(d)=demo('), department=dept, department head=DH, Department of Defense=DoD, discrepancies=discreps, division=div, enlisted personnel=Enl Pers, evaluation(s)=eval(s), Executive Officer=XO, Federal=Fed, Federal On Scene Coordinator=FOSC, forward=fwd, from=fm/frm, government=Govt, graduate school=grad school, headquarters=hdqrts, Coast Guard headquarters=CGHQ, high visibility=hi-vis, hours=hrs, identify/identified=ID/ID's, in support of=ISO, Incident Command Post=ICP, Incident Command System=ICS, Incident Commander=IC, included=incl('d), increased=incr('d), intelligence=intel, international=intn'l/intl, junior=jr, Junior Officer(s)=JO(s), knowledge=knwlg, law enforcement=LE, leader=ldr, leadership=ldrshp, letter=ltr, level=lvl, management=mgmnt, manager=mgr/mngr, Master Chief Petty Officer of the Coast Guard=MCPOCG, maximum/maximized=max/max'd, medical evacuation=MEDVAC, meeting=mtg, member=Mbr/SVM/ROM, message=msg, national=nat'l, officer=offcr, Officer in Charge=OIC, Officer of the Day=OOD, Operational Tempo=OPTEMPO, operations=ops, opportunity=oppty, Outside Continental United States=OCONUS, package(s)=pkg(s), passenger(s)=Pax(s)/psngr(s), performance=perf, Personal Protective Equipment=PPE, position=posn, preparation=prep, prepared=prep'd, President of the United States=POTUS, Vice President of the United States=VPOTUS, professional=prof'l, project=proj, quarter/quarterly=qtr/qtrl'y, received=rvd, recommendation=recomd, letter of recommendation=ltr of rec, regulations=regs, representative=rep, represented=rep'd, requested=reqst'd, required=req'd, schedule=sched, search and rescue=SAR, Sector=Sec, Sector Command Center=SCC, senior=sr, service=svs/Svs, square miles=sq mi, station=STA/stas/sta, subject=subj, subject matter specialist=SME, subordinate=subord, system=sys, technical=tech'l, temporary=temp, Temporary Assigned Duty=TDY, thousand=K, through=thru, training=trng, travel=tvl, underway=U/W, vessel=vsl, Vice Commandant=VCG, violations=vios, visibility=vis, weather=wx, with regard to=wrt, year=Yr`
  : "- Avoid abbreviated wording unless the user already provided it in the accomplishment.";

    const userPrompt = `
You are writing performance evaluation bullets for a U.S. Coast Guard member.

Rules:
- Return valid JSON only in this shape: {"bullet":"...","title":"..."}
- 'bullet' must start with a dash (-)
- 'bullet' must use strong action verbs
- 'bullet' must focus on measurable impact and results
- 'bullet' must be concise and professional
- 'bullet' must avoid filler words
- 'title' must be 2-3 words
- 'title' must be Title Case
- 'title' must briefly label the accomplishment without punctuation at the end
- Use the supporting data when helpful
- Do not ignore provided mission impact
- Do not invent numbers that were not provided
${impactInclusionRule}
${abbreviationsGuidance}

Structure:
Action → Result → Impact

Category:
${categoryValue}

Category Guidance:
${categoryGuidance}

Rank Level:
${rankValue}

Rating:
${ratingValue}

Rank Level Guidance:
${rankGuidance}

Bullet Style Preference:
${bulletStyleValue}

Style Guidance:
- If Bullet Style Preference is "Short/Concise", keep wording compact and minimize extra clauses.
- If Bullet Style Preference is "Detailed", include stronger supporting context while still staying tight and readable.
- If Bullet Style Preference is "Standard", keep equal emphasis on action, result, and impact.

${supportingData}

${officialGuidanceContext}

${alternateCategoryRewriteContext}

${rewordForCategoryContext}

Example:
{"bullet":"- Developed and implemented trng plan for 12 new Mbrs; increased qualification completion rates 30% and improved unit readiness.","title":"Training Leadership"}

Rewrite the following accomplishment as a professional evaluation bullet and short title.

Accomplishment:
${normalizedAccomplishment}
`;

    const createCompletion = async (prompt: string) =>
      client.chat.completions.create({
        model: selectedModel,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 350,
        temperature: 0.7,
      });

    let completion = await createCompletion(userPrompt);
    let content = completion.choices[0]?.message?.content?.trim() || "";
    let parsedResult = parseGeneratedResult(content);

    if (
      (isAlternateCategoryRewrite || isRewordForCategory) &&
      sourceBulletValue &&
      normalizeComparableBullet(parsedResult.bullet) === normalizeComparableBullet(sourceBulletValue)
    ) {
      const retryPrompt = `${userPrompt}

Your previous answer matched the existing bullet too closely. Try again and produce a meaningfully improved rewrite that is clearly different in wording while still fitting the category.`;
      completion = await createCompletion(retryPrompt);
      content = completion.choices[0]?.message?.content?.trim() || "";
      parsedResult = parseGeneratedResult(content);
    }

    await logAiUsageEvent({
      userId: user.id,
      endpoint: routeName,
      model: selectedModel,
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens: completion.usage?.total_tokens,
      success: true,
      documentReferenceCount: officialGuidanceSections.length,
      retrievalCallCount: officialGuidanceSections.length > 0 ? 1 : 0,
      docContextPromptTokens: estimateTokenCountFromText(officialGuidanceContext),
    });
    await incrementDailyGenerationUsage(user.id);

    logApiRequestMetadata({ requestId, routeName, inputLength, success: true, status: 200 });
    return Response.json({
      bullet: parsedResult.bullet,
      title: parsedResult.title,
      guidanceSections: officialGuidanceSections,
    });
  } catch (error: unknown) {
    if (userIdForLogging) {
      try {
        await logAiUsageEvent({
          userId: userIdForLogging,
          endpoint: routeName,
          model: selectedModelForLogging,
          success: false,
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        });
      } catch {
        // Avoid masking the original endpoint failure.
      }
    }

    logApiError("OpenAI route error", error, { requestId, routeName, inputLength, success: false });
    logApiRequestMetadata({ requestId, routeName, inputLength, success: false, status: 500 });

    return Response.json(
      {
        error: "Unable to generate a mark right now. Please try again.",
      },
      { status: 500 }
    );
  }
}