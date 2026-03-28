import {
  createUser,
  findUserByUsername,
  isValidEmail,
  sanitizeEmail,
  sanitizeUsername,
  updateUserStripeCustomerIdById,
} from "@/lib/userStore";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { logApiError } from "@/lib/safeLogging";
import { getStripeClient } from "@/lib/stripe";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      username?: string;
      email?: string;
      password?: string;
    };

    const username = sanitizeUsername(body.username || "");
    const email = sanitizeEmail(body.email || "");
    const password = (body.password || "").trim();

    if (username.length < 3 || username.length > 40) {
      return Response.json(
        { error: "Username must be 3-40 characters." },
        { status: 400 }
      );
    }

    if (password.length < 8 || password.length > 128) {
      return Response.json(
        { error: "Password must be 8-128 characters." },
        { status: 400 }
      );
    }

    if (email && !isValidEmail(email)) {
      return Response.json(
        { error: "Enter a valid email address." },
        { status: 400 }
      );
    }

    const existing = await findUserByUsername(username);
    if (existing) {
      return Response.json(
        { error: "An account with that username already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser({ username, email, passwordHash });

    try {
      const stripe = getStripeClient();
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: user.username,
        metadata: {
          appUserId: user.id,
        },
      });

      await updateUserStripeCustomerIdById(user.id, customer.id);
    } catch (stripeError: unknown) {
      // Best effort: signup should still succeed even if Stripe is temporarily unavailable.
      logApiError("signup stripe customer creation error", stripeError, {
        routeName: "/api/auth/signup",
      });
    }

    await setSessionCookie({ id: user.id, username: user.username });

    return Response.json({
      user: {
        id: user.id,
        username: user.username,
        needsTutorial: !user.hasCompletedTutorial,
        needsEmail: !user.emailLower,
        planTier: "free",
        planStatus: null,
        dailyUsageCount: 0,
        dailyUsageLimit: 5,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "EMAIL_EXISTS") {
      return Response.json(
        { error: "An account with that email already exists." },
        { status: 409 }
      );
    }

    logApiError("signup error", error);
    return Response.json({ error: "Failed to create account." }, { status: 500 });
  }
}
