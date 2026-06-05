import Stripe from "stripe";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export const stripe = new Stripe(requiredEnv("STRIPE_SECRET_KEY"), {
  apiVersion: "2026-05-27.dahlia",
});

export function stripeWebhookSecret(): string {
  return requiredEnv("STRIPE_WEBHOOK_SECRET");
}

export function usedListingFeeCents(): number {
  const v = Number(process.env.USED_LISTING_FEE_CENTS || 1999);
  if (!Number.isFinite(v) || v <= 0) return 1999;
  return Math.round(v);
}

export function siteUrl(): string {
  return (process.env.SITE_URL || "http://localhost:5173").replace(/\/$/, "");
}

