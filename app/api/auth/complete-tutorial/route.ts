import { requireSessionUser } from "@/lib/auth";
import { markTutorialCompleted } from "@/lib/userStore";

export async function POST() {
  const { user, response } = await requireSessionUser();
  if (response || !user) {
    return response;
  }

  const updatedUser = await markTutorialCompleted(user.id);
  if (!updatedUser) {
    return Response.json({ error: "User not found." }, { status: 404 });
  }

  return Response.json({ success: true });
}