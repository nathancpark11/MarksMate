import OpenAI from "openai";
import { requireSessionUser } from "@/lib/auth";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "missing-openai-api-key",
});

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

export async function POST(req: Request) {
  try {
    const { response: authResponse } = await requireSessionUser();
    if (authResponse) {
      return authResponse;
    }

    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: "Server misconfiguration: OPENAI_API_KEY is not set." },
        { status: 500 }
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
    } = await req.json();

    if (!accomplishment || !accomplishment.trim()) {
      return Response.json(
        { error: "Please enter an accomplishment." },
        { status: 400 }
      );
    }

    const categoryValue = category || "Quality of Work";
    const rankValue = rankLevel || "E4";
    const ratingValue = rating || "Undesignated";
    const bulletStyleValue = bulletStyle || "Standard";

    const categoryGuidance = getCategoryGuidance(categoryValue);
    const rankGuidance = getRankGuidance(rankValue);
    const impactInclusionRule = missionImpact && missionImpact.trim()
      ? "- If mission impact is provided, explicitly include that impact in the bullet."
      : "- If mission impact is not provided, infer impact only from other provided data.";

    const supportingData = `
Supporting Data:
- People affected: ${peopleAffected || "Not provided"}
- Percent improved: ${percentImproved || "Not provided"}
- Hours saved: ${hoursSaved || "Not provided"}
- Mission impact: ${missionImpact || "Not provided"}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: `
You are writing performance evaluation bullets for a U.S. Coast Guard member.

Rules:
- Start with a dash (-)
- Use strong action verbs
- Focus on measurable impact and results
- Keep it to one sentence
- Be concise and professional
- Avoid filler words
- Return only the bullet
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
- If Bullet Style Preference is "Detailed", include stronger supporting context while still keeping one sentence.
- If Bullet Style Preference is "Standard", keep equal emphasis on action, result, and impact.

${supportingData}

Example:
- Developed and implemented training plan for 12 new members; increased qualification completion rates 30% and improved unit readiness.

Rewrite the following accomplishment as a professional evaluation bullet.

Accomplishment:
${accomplishment}
`,
        },
      ],
      max_tokens: 200,
      temperature: 0.7,
    });

    return Response.json({
      bullet: completion.choices[0]?.message?.content?.trim(),
    });
  } catch (error: unknown) {
    console.error("OpenAI route error:", error);

    const message =
      error instanceof Error
        ? error.message
        : "OpenAI request failed. Check the terminal for details.";

    return Response.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}