import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Stripe is not configured");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(key, {
      apiVersion: "2026-05-27.dahlia",
    });
  }
  return stripeClient;
}

export function stripeWebhookSecret(): string {
  const v = process.env.STRIPE_WEBHOOK_SECRET;
  if (!v) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  return v;
}

export function usedListingFeeCents(): number {
  const v = Number(process.env.USED_LISTING_FEE_CENTS || 1999);
  if (!Number.isFinite(v) || v <= 0) return 1999;
  return Math.round(v);
}

export function siteUrl(): string {
  return (process.env.SITE_URL || "http://localhost:5173").replace(/\/$/, "");
}
