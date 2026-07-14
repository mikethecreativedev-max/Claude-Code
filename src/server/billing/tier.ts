import { requireAuth, type SessionUser } from "@/server/auth/session";
import { scopedOrganisation } from "@/server/db/scoped-client";

/**
 * Minimal V1 tier gate, built ahead of Phase 3 ("Free Tier", a separate
 * worktree that owns the full free/paid module-access matrix — see
 * BUILD_CHECKLIST.md Phase 3). This exists so Phase 7's Stripe webhook can
 * be proven to flip access immediately: it reads
 * Organisation.subscriptionTier fresh via scopedOrganisation() on every
 * call — no caching, no reliance on a (potentially stale) JWT claim — so a
 * webhook-driven FREE->PAID flip is visible on the very next call.
 *
 * Phase 3 is free to replace or extend this; the shape (async function,
 * throws TierRequiredError, always re-reads the DB) is the important part
 * to preserve if it does.
 */
export class TierRequiredError extends Error {
  constructor(requiredTier: "PAID") {
    super(`This feature requires the ${requiredTier} subscription tier`);
    this.name = "TierRequiredError";
  }
}

export async function requireTier(minTier: "PAID"): Promise<SessionUser> {
  const session = await requireAuth();
  if (minTier === "PAID") {
    const org = await scopedOrganisation(session.orgId).get();
    if (org?.subscriptionTier !== "PAID") {
      throw new TierRequiredError(minTier);
    }
  }
  return session;
}
