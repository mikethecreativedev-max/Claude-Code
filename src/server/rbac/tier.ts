import type { ModuleName, SubscriptionTier } from "@prisma/client";

import { rawPrisma } from "@/server/db/prisma";
import type { SessionUser } from "@/server/auth/session";
import { requireModulePermission, type PermissionLevel } from "./permissions";

// Organisation is read directly via rawPrisma here, not through
// scopedDb(). This is not a tenant-isolation violation: Organisation is
// not in scoped-client.ts's TENANT_MODELS set (it IS the tenant, not a
// child row scoped to one — same reasoning as bncl-admin/client.ts's
// listOrgsForSuperAdmin, and the same shape of exception permissions.ts
// documents for the global RolePermission table). This file is
// allowlisted in scripts/check-tenant-isolation-imports.js for exactly
// this reason, and the lookup below is always keyed on the *session's
// own* orgId — never client-suppliable input.

/**
 * Thrown by requireTier() when the caller's organisation does not meet the
 * required subscription tier. Route handlers/server actions should let this
 * propagate to a 403 response.
 */
export class TierRequiredError extends Error {
  readonly requiredTier: SubscriptionTier;
  constructor(requiredTier: SubscriptionTier) {
    super(`This module requires the "${requiredTier}" subscription tier`);
    this.name = "TierRequiredError";
    this.requiredTier = requiredTier;
  }
}

/**
 * Modules available to every organisation regardless of subscriptionTier,
 * per BUILD_CHECKLIST.md Phase 3. Every other ModuleName is paid-tier
 * gated when routed through requireModulePermissionWithTier(). Keep this
 * list in sync with BUILD_CHECKLIST.md Phase 3's free-tier module list if
 * either changes.
 */
export const FREE_TIER_MODULES: ReadonlySet<ModuleName> = new Set<ModuleName>([
  "DASHBOARD",
  "QG_HUB",
  "READINESS_SCORER",
  "ADMIN_USERS",
  "ADMIN_SITES",
  "BNCL_SUPER_ADMIN",
]);

/**
 * The subscription-tier gate. Given an already-authenticated `session`
 * (never construct one from client input — always the output of
 * requireAuth()/requireModulePermission()), throws TierRequiredError unless
 * the caller's own organisation currently meets `required`.
 *
 * Deliberately re-reads Organisation.subscriptionTier from the database on
 * every call rather than trusting a JWT claim. subscriptionTier changes via
 * Stripe webhook (see BUILD_CHECKLIST.md Phase 7), and that phase's
 * acceptance criteria requires a tier flip to take effect immediately with
 * no cache/staleness window — a JWT-embedded claim would only refresh on
 * next login/token rotation, which would violate that requirement. The
 * extra query is a single indexed primary-key lookup, not a meaningful cost.
 *
 * @param session  The verified caller session (e.g. from requireAuth()).
 * @param required The minimum subscription tier this module/route needs.
 * @throws TierRequiredError if the caller's org tier is insufficient.
 */
export async function requireTier(
  session: SessionUser,
  required: SubscriptionTier
): Promise<void> {
  // FREE is the floor of the tier model — every org qualifies, so skip the
  // lookup entirely for FREE-gated modules.
  if (required === "FREE") return;

  const org = await rawPrisma.organisation.findUniqueOrThrow({
    where: { id: session.orgId },
    select: { subscriptionTier: true },
  });

  // Two-tier model today (FREE < PAID): a simple inequality check. If a
  // third tier is ever introduced, replace this with an explicit
  // tier-rank comparison rather than widening this condition ad hoc.
  if (org.subscriptionTier !== required) {
    throw new TierRequiredError(required);
  }
}

/**
 * The standard entry point for a paid-tier-gated route handler or server
 * action: runs the full auth -> org -> RBAC -> tier chain in one call.
 * Composes requireModulePermission() (steps 1-3) with requireTier() (step
 * 4) so a FREE-tier org is rejected even when RolePermission would
 * otherwise grant the caller's role access to the module.
 *
 * Use this instead of requireModulePermission() directly for any
 * ModuleName not in FREE_TIER_MODULES — Phase 4/5/6/7 should call this for
 * every paid module (AUDITS, INCIDENTS, EVENTS, RISK_REGISTER, POLICIES,
 * FEEDBACK_COMPLAINTS, NOTICES, TRAINING, CALENDAR, EVIDENCE_PACKS,
 * ADMIN_BILLING, ADMIN_DATA_PROTECTION) rather than requireModulePermission()
 * alone.
 *
 * @example
 *   const session = await requireModulePermissionWithTier("AUDITS", "view");
 *
 * @param module The ModuleName being accessed.
 * @param level  The permission level required ("view" | "edit" | "approve").
 * @param tier   The minimum subscription tier required. Defaults to "PAID"
 *               since this helper's whole purpose is gating paid modules.
 */
export async function requireModulePermissionWithTier(
  module: ModuleName,
  level: PermissionLevel,
  tier: SubscriptionTier = "PAID"
): Promise<SessionUser> {
  const session = await requireModulePermission(module, level);
  await requireTier(session, tier);
  return session;
}
