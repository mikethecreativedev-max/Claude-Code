import type Stripe from "stripe";

import {
  findOrganisationByStripeId,
  systemUpdateOrganisationBilling,
} from "@/server/db/scoped-client";
import { getStripeClient } from "./stripe-client";

/**
 * Stripe webhook handling.
 *
 * verifyStripeWebhook() is the ONLY entry point that should ever feed a
 * network-received payload into applyStripeEvent() — it enforces
 * `stripe.webhooks.constructEvent()` signature verification against
 * STRIPE_WEBHOOK_SECRET and throws WebhookSignatureError on any failure
 * (missing/invalid signature, tampered body, wrong secret). There is no
 * "trust the payload" shortcut in this path, including for testing —
 * signature verification is non-negotiable per BUILD_CHECKLIST.md Phase 7.
 *
 * applyStripeEvent() is deliberately exported separately and takes an
 * already-verified Stripe.Event object. This lets
 * tests/phase7-admin-billing.test.ts exercise the update logic against a
 * *locally self-signed* event — constructed with the real
 * `stripe.webhooks.generateTestHeaderString` + a test secret and passed
 * back through verifyStripeWebhook() exactly like a real request would be
 * — rather than needing a live Stripe account. The production code path
 * (src/app/api/webhooks/stripe/route.ts) always calls verifyStripeWebhook()
 * first; it never calls applyStripeEvent() with an unverified payload.
 */

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(`Stripe webhook signature verification failed: ${message}`);
    this.name = "WebhookSignatureError";
  }
}

export function verifyStripeWebhook(rawBody: string | Buffer, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  }
  const stripe = getStripeClient();
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    throw new WebhookSignatureError(err instanceof Error ? err.message : String(err));
  }
}

export type ApplyResult =
  | { applied: true; orgId: string; eventType: string }
  | { applied: false; reason: string; eventType: string };

function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status
): "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
    case "paused":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    default:
      return "PAST_DUE";
  }
}

function stripeIdOf(value: string | { id: string } | null | undefined): string | undefined {
  if (!value) return undefined;
  return typeof value === "string" ? value : value.id;
}

/**
 * Applies an already-signature-verified Stripe event to
 * Organisation.subscriptionTier / billingStatus. Every write goes through
 * systemUpdateOrganisationBilling() (src/server/db/scoped-client.ts), which
 * is the only place besides bncl-admin/client.ts allowed to touch an
 * Organisation row without a session-derived orgId — narrowly, and only by
 * an id resolved from Stripe-controlled fields, never client input.
 */
export async function applyStripeEvent(event: Stripe.Event): Promise<ApplyResult> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.metadata?.orgId ?? session.client_reference_id ?? undefined;
      if (!orgId) {
        return { applied: false, reason: "no orgId in session metadata/client_reference_id", eventType: event.type };
      }

      await systemUpdateOrganisationBilling(orgId, {
        subscriptionTier: "PAID",
        billingStatus: "ACTIVE",
        ...(stripeIdOf(session.customer) ? { stripeCustomerId: stripeIdOf(session.customer) } : {}),
        ...(stripeIdOf(session.subscription)
          ? { stripeSubscriptionId: stripeIdOf(session.subscription) }
          : {}),
      });
      return { applied: true, orgId, eventType: event.type };
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const org = await findOrganisationByStripeId({
        stripeSubscriptionId: sub.id,
        stripeCustomerId: stripeIdOf(sub.customer),
      });
      if (!org) {
        return { applied: false, reason: "no organisation matches this Stripe subscription/customer", eventType: event.type };
      }

      const billingStatus = mapStripeSubscriptionStatus(sub.status);
      await systemUpdateOrganisationBilling(org.id, {
        billingStatus,
        subscriptionTier: billingStatus === "ACTIVE" || billingStatus === "TRIALING" ? "PAID" : org.subscriptionTier,
      });
      return { applied: true, orgId: org.id, eventType: event.type };
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const org = await findOrganisationByStripeId({
        stripeSubscriptionId: sub.id,
        stripeCustomerId: stripeIdOf(sub.customer),
      });
      if (!org) {
        return { applied: false, reason: "no organisation matches this Stripe subscription/customer", eventType: event.type };
      }

      await systemUpdateOrganisationBilling(org.id, {
        subscriptionTier: "FREE",
        billingStatus: "CANCELED",
      });
      return { applied: true, orgId: org.id, eventType: event.type };
    }

    default:
      return { applied: false, reason: `unhandled event type`, eventType: event.type };
  }
}
