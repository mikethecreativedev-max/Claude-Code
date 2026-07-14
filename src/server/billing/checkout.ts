import { requireModulePermission } from "@/server/rbac/permissions";
import { scopedOrganisation } from "@/server/db/scoped-client";
import { getStripeClient } from "./stripe-client";

/**
 * Checkout / Customer Portal session creation. Both require
 * ADMIN_BILLING "edit" (the generic RBAC gate) AND, per the product
 * requirement ("redirect an OWNER to Stripe Checkout"), the session role
 * must literally be OWNER — REGISTERED_MANAGER has canEdit=true on
 * ADMIN_BILLING in the seeded matrix (it can view/manage most admin
 * modules) but billing/subscription changes are deliberately restricted
 * further, to Owner only. This is a business rule on top of the RBAC
 * matrix, not a replacement for it — the module-permission check still
 * runs first.
 */
export class OwnerOnlyActionError extends Error {
  constructor() {
    super("Only the organisation Owner can manage billing/subscription.");
    this.name = "OwnerOnlyActionError";
  }
}

function baseUrl(): string {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

export async function createCheckoutSessionForOrg(): Promise<string> {
  const session = await requireModulePermission("ADMIN_BILLING", "edit");
  if (session.role !== "OWNER") {
    throw new OwnerOnlyActionError();
  }

  const priceId = process.env.STRIPE_PRICE_ID_PAID_TIER;
  if (!priceId) {
    throw new Error("STRIPE_PRICE_ID_PAID_TIER is not set");
  }

  const org = await scopedOrganisation(session.orgId).get();
  if (!org) {
    throw new Error("Organisation not found for current session");
  }

  const stripe = getStripeClient();
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(org.stripeCustomerId
      ? { customer: org.stripeCustomerId }
      : { customer_email: session.email }),
    line_items: [{ price: priceId, quantity: 1 }],
    // client_reference_id AND metadata both carry orgId: Checkout Session
    // events surface client_reference_id directly, while metadata survives
    // onto the created Subscription/Invoice objects too. Belt and braces —
    // the webhook handler checks both.
    client_reference_id: session.orgId,
    metadata: { orgId: session.orgId },
    subscription_data: { metadata: { orgId: session.orgId } },
    success_url: `${baseUrl()}/dashboard/admin/billing?checkout=success`,
    cancel_url: `${baseUrl()}/dashboard/admin/billing?checkout=cancel`,
  });

  if (!checkoutSession.url) {
    throw new Error("Stripe did not return a Checkout Session URL");
  }
  return checkoutSession.url;
}

export async function createPortalSessionForOrg(): Promise<string> {
  const session = await requireModulePermission("ADMIN_BILLING", "edit");
  if (session.role !== "OWNER") {
    throw new OwnerOnlyActionError();
  }

  const org = await scopedOrganisation(session.orgId).get();
  if (!org?.stripeCustomerId) {
    throw new Error(
      "No Stripe customer on file for this organisation yet — complete Checkout first."
    );
  }

  const stripe = getStripeClient();
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${baseUrl()}/dashboard/admin/billing`,
  });

  return portalSession.url;
}
