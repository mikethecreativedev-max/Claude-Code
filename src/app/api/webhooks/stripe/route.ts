import { NextRequest, NextResponse } from "next/server";

import { applyStripeEvent, verifyStripeWebhook, WebhookSignatureError } from "@/server/billing/webhook";

/**
 * Stripe webhook endpoint. Deliberately does NOT call requireAuth() /
 * requireModulePermission() — there is no user session on a webhook
 * request. Instead, authenticity is established by verifying the Stripe
 * signature against STRIPE_WEBHOOK_SECRET. Any request that fails
 * signature verification (missing header, tampered body, wrong secret) is
 * rejected with 400 before any data is touched — no "trust the payload"
 * fallback, per BUILD_CHECKLIST.md Phase 7.
 *
 * req.text() (not req.json()) is used deliberately to get the exact raw
 * request bytes Stripe signed — re-serializing a parsed JSON object would
 * not reproduce the same bytes and would break signature verification.
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event;
  try {
    event = verifyStripeWebhook(rawBody, signature);
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
    }
    throw err;
  }

  const result = await applyStripeEvent(event);
  return NextResponse.json({ received: true, result });
}
