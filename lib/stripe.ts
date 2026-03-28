import Stripe from "stripe";

let stripeClient: Stripe | null = null;

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Server misconfiguration: ${name} is not set.`);
  }
  return value;
}

export function getStripeClient() {
  if (!stripeClient) {
    stripeClient = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
      apiVersion: "2026-03-25.dahlia",
    });
  }

  return stripeClient;
}

export function getStripeWebhookSecret() {
  return requireEnv("STRIPE_WEBHOOK_SECRET");
}

export function getStripePriceId(billingCycle: "monthly" | "yearly") {
  if (billingCycle === "yearly") {
    return requireEnv("STRIPE_PRICE_YEARLY_ID");
  }

  return requireEnv("STRIPE_PRICE_MONTHLY_ID");
}

export function getStripeSuccessUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  if (!appUrl) {
    throw new Error("Server misconfiguration: NEXT_PUBLIC_APP_URL (or APP_URL) is not set.");
  }
  return `${appUrl.replace(/\/$/, "")}/?billing=success`;
}

export function getStripeCancelUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  if (!appUrl) {
    throw new Error("Server misconfiguration: NEXT_PUBLIC_APP_URL (or APP_URL) is not set.");
  }
  return `${appUrl.replace(/\/$/, "")}/?billing=cancel`;
}
