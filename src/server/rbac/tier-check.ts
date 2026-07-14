import { scopedDb } from "@/server/db/scoped-client";

export class TierRequiredError extends Error {
  constructor(tier: string) {
    super(`This module requires the ${tier} subscription tier`);
    this.name = "TierRequiredError";
  }
}

/**
 * DEVIATION / TODO: BUILD_CHECKLIST.md's Phase 4 instructions call for a
 * `requireTier('PAID')` helper. That helper is expected to land under
 * src/server/rbac/ or src/server/auth/ from Phase 3's work, which is being
 * built concurrently in a separate worktree/branch (claude/phase3-...) and
 * had NOT merged into this branch (claude/bncl-compliance-setup) as of
 * when this file was written — confirmed by grepping this worktree for
 * `requireTier` and finding zero matches.
 *
 * This is a local, narrowly-scoped stand-in used only by the Audits and
 * Incidents modules (this phase's ownership). It re-reads the caller's
 * Organisation row (Organisation is intentionally NOT in scoped-client.ts's
 * TENANT_MODELS set, since the org row IS the tenant rather than a
 * tenant-owned record — scopedDb() still requires an orgId argument for
 * consistency of call sites, but does not inject/verify it against this
 * particular model) and checks `subscriptionTier`.
 *
 * Once Phase 3's requireTier() merges into this branch, this function
 * should be deleted and call sites (src/server/audits/service.ts,
 * src/server/incidents/service.ts) switched over to it.
 */
export async function requirePaidTier(orgId: string): Promise<void> {
  const org = await scopedDb(orgId).organisation.findUnique({ where: { id: orgId } });
  if (!org || org.subscriptionTier !== "PAID") {
    throw new TierRequiredError("PAID");
  }
}
