import { z } from "zod";
import { supabaseAdmin } from "./supabase.js";

export const CreateUsedListingSchema = z.object({
  title: z.string().min(8).max(180),
  price: z.number().finite().nonnegative(),
  currency: z.string().min(3).max(3).default("USD"),
  condition: z.string().max(30).optional(),
  chassis: z.array(z.string().min(2).max(10)).optional(),
  engine: z.array(z.string().min(2).max(10)).optional(),
  notes: z.string().max(2000).optional(),
  location: z.string().max(120).optional(),
  contactEmail: z.string().email().optional(),
  images: z.array(z.string().min(1).max(500)).max(10).optional(),
});

export type CreateUsedListingInput = z.infer<typeof CreateUsedListingSchema>;

export function toCents(price: number): number {
  return Math.round(price * 100);
}

export async function createDraftUsedListing(params: {
  ownerId: string;
  input: CreateUsedListingInput;
}) {
  const { ownerId, input } = params;
  const row = {
    owner_id: ownerId,
    status: "draft",
    title: input.title,
    price_cents: toCents(input.price),
    currency: (input.currency || "USD").toUpperCase(),
    condition: input.condition ?? null,
    chassis: (input.chassis ?? []).map((c) => c.toUpperCase()),
    engine: (input.engine ?? []).map((e) => e.toUpperCase()),
    notes: input.notes ?? null,
    location: input.location ?? null,
    contact_email: input.contactEmail ?? null,
    images: input.images ?? [],
  };

  const { data, error } = await supabaseAdmin
    .from("used_listings")
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getUsedListingById(id: string) {
  const { data, error } = await supabaseAdmin
    .from("used_listings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listPublishedUsedListings(limit = 200) {
  const { data, error } = await supabaseAdmin
    .from("used_listings")
    .select("*")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function ensurePaymentRow(params: {
  listingId: string;
  ownerId: string;
  sessionId: string;
  amountCents: number;
  currency: string;
}) {
  const { listingId, ownerId, sessionId, amountCents, currency } = params;
  const { error } = await supabaseAdmin.from("listing_payments").insert({
    listing_id: listingId,
    owner_id: ownerId,
    stripe_checkout_session_id: sessionId,
    amount_cents: amountCents,
    currency,
    status: "created",
  });
  if (error) throw new Error(error.message);
}

export async function markListingPaidAndPublish(params: {
  sessionId: string;
  paymentIntentId?: string | null;
}) {
  const { sessionId, paymentIntentId } = params;
  const { data: payment, error: paymentErr } = await supabaseAdmin
    .from("listing_payments")
    .select("*")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();
  if (paymentErr) throw new Error(paymentErr.message);
  if (!payment) throw new Error("Payment row not found");

  if (payment.status === "paid") return { listingId: payment.listing_id };

  const { error: updPayErr } = await supabaseAdmin
    .from("listing_payments")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId ?? null,
    })
    .eq("id", payment.id);
  if (updPayErr) throw new Error(updPayErr.message);

  if (payment.listing_id) {
    const { error: updListErr } = await supabaseAdmin
      .from("used_listings")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
      })
      .eq("id", payment.listing_id);
    if (updListErr) throw new Error(updListErr.message);
  }

  return { listingId: payment.listing_id };
}

