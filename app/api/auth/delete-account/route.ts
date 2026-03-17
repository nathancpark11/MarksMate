import { clearSessionCookie, requireSessionUser } from "@/lib/auth";
import { deleteUserById } from "@/lib/userStore";
import { logApiError } from "@/lib/safeLogging";

export async function DELETE() {
  const { user, response } = await requireSessionUser();
  if (response) {
    return response;
  }

  try {
    await deleteUserById(user.id);
    await clearSessionCookie();
    return Response.json({ ok: true });
  } catch (error: unknown) {
    logApiError("delete-account error", error);
    return Response.json({ error: "Failed to delete account." }, { status: 500 });
  }
}
