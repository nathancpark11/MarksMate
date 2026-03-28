import { requireSessionUser } from "@/lib/auth";
import { enforceGenerationAccess, incrementDailyGenerationUsage } from "@/lib/usageLimits";

export async function POST() {
  const { user, response: authResponse } = await requireSessionUser();
  if (authResponse) {
    return authResponse;
  }

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

  await incrementDailyGenerationUsage(user.id);

  return Response.json({ ok: true });
}
