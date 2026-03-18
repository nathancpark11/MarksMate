import OpenAI from "openai";
import { requireSessionUser } from "@/lib/auth";
import { validateCombinedAiInputs } from "@/lib/promptSpamGuard";
import { enforceRateLimits } from "@/lib/rateLimit";
import { getRequestId, logApiError, logApiRequestMetadata } from "@/lib/safeLogging";
import { getCategorySpecificGuidanceContext } from "@/lib/officialGuidance";
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

export async function POST(req: Request) {
  const routeName = "/api/generate";
  const requestId = getRequestId(req);
  let inputLength = 0;

  try {
    const { user, response: authResponse } = await requireSessionUser();
    if (authResponse) {
      return authResponse;
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
      generationIntent,
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
      generationIntent?: unknown;
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
    const bulletStyleValue = typeof bulletStyle === "string" && bulletStyle ? bulletStyle : "Standard";
    const peopleAffectedValue =
      typeof peopleAffected === "string" && peopleAffected ? peopleAffected : "";
    const percentImprovedValue =
      typeof percentImproved === "string" && percentImproved ? percentImproved : "";
    const hoursSavedValue = typeof hoursSaved === "string" && hoursSaved ? hoursSaved : "";
    const generationIntentValue =
      typeof generationIntent === "string" && generationIntent ? generationIntent : "";

    const categoryGuidance = getCategoryGuidance(categoryValue);
    const rankGuidance = getRankGuidance(rankValue);
    const isVagueEntry = isLikelyVagueAccomplishment(normalizedAccomplishment);
    const selectedModel =
      user?.isGuest
        ? SIMPLE_MODEL
        : generationIntentValue === "final-polished-official-mark"
          ? FINAL_MARK_MODEL
          : isVagueEntry
            ? VAGUE_ENTRY_MODEL
            : SIMPLE_MODEL;
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

    const completion = await client.chat.completions.create({
      model: selectedModel,
      messages: [
        {
          role: "user",
          content: `
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
- When writing the bullet, prioritize the following approved Coast Guard abbreviations where appropriate:

Approved Abbreviations:
additional=add'l, administration=admin, administrative separation=ADSEP, advancement list=adv lst, and=&, approved=appvd, area of responsibility=AOR, air station=airsta/A/S, attention=attn, auxiliary=aux, between=btwn, building=bld, Captain of the Port=COTP, certification=cert, chief petty officer=CPO, civilian=civ, Coast Guard=CG, command=cmd, Command Duty Officer=CDO, Command Master Chief=CMC, Commandant (office)=Comdt, Commandant (person)=CCG, Commanding Officer=CO, communication=comms, conference=conf, coordinate(d)=coord, demonstrate(d)=demo('), department=dept, department head=DH, Department of Defense=DoD, discrepancies=discreps, division=div, enlisted personnel=Enl Pers, evaluation(s)=eval(s), Executive Officer=XO, Federal=Fed, Federal On Scene Coordinator=FOSC, forward=fwd, from=fm/frm, government=Govt, graduate school=grad school, headquarters=hdqrts, Coast Guard headquarters=CGHQ, high visibility=hi-vis, hours=hrs, identify/identified=ID/ID's, in support of=ISO, Incident Command Post=ICP, Incident Command System=ICS, Incident Commander=IC, included=incl('d), increased=incr('d), intelligence=intel, international=intn'l/intl, junior=jr, Junior Officer(s)=JO(s), knowledge=knwlg, law enforcement=LE, leader=ldr, leadership=ldrshp, letter=ltr, level=lvl, management=mgmnt, manager=mgr/mngr, Master Chief Petty Officer of the Coast Guard=MCPOCG, maximum/maximized=max/max'd, medical evacuation=MEDVAC, meeting=mtg, member=Mbr/SVM/ROM, message=msg, national=nat'l, officer=offcr, Officer in Charge=OIC, Officer of the Day=OOD, Operational Tempo=OPTEMPO, operations=ops, opportunity=oppty, Outside Continental United States=OCONUS, package(s)=pkg(s), passenger(s)=Pax(s)/psngr(s), performance=perf, Personal Protective Equipment=PPE, position=posn, preparation=prep, prepared=prep'd, President of the United States=POTUS, Vice President of the United States=VPOTUS, professional=prof'l, project=proj, quarter/quarterly=qtr/qtrl'y, received=rvd, recommendation=recomd, letter of recommendation=ltr of rec, regulations=regs, representative=rep, represented=rep'd, requested=reqst'd, required=req'd, schedule=sched, search and rescue=SAR, Sector=Sec, Sector Command Center=SCC, senior=sr, service=svs/Svs, square miles=sq mi, station=STA/stas/sta, subject=subj, subject matter specialist=SME, subordinate=subord, system=sys, technical=tech'l, temporary=temp, Temporary Assigned Duty=TDY, thousand=K, through=thru, training=trng, travel=tvl, underway=U/W, vessel=vsl, Vice Commandant=VCG, violations=vios, visibility=vis, weather=wx, with regard to=wrt, year=Yr

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

Example:
{"bullet":"- Developed and implemented trng plan for 12 new Mbrs; increased qualification completion rates 30% and improved unit readiness.","title":"Training Leadership"}

Rewrite the following accomplishment as a professional evaluation bullet and short title.

Accomplishment:
${normalizedAccomplishment}
`,
        },
      ],
      max_tokens: 350,
      temperature: 0.7,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    const parsedResult = parseGeneratedResult(content || "");

    logApiRequestMetadata({ requestId, routeName, inputLength, success: true, status: 200 });
    return Response.json({
      bullet: parsedResult.bullet,
      title: parsedResult.title,
      guidanceSections: officialGuidanceSections,
    });
  } catch (error: unknown) {
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