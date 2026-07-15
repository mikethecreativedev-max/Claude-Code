/**
 * ─────────────────────────────────────────────────────────────────────────
 * COMPLIANCE SCORE — V1 PLACEHOLDER (see also README.md "Compliance score")
 * ─────────────────────────────────────────────────────────────────────────
 * This is a deliberately simple, PROVISIONAL formula for the dashboard's
 * compliance score ring. It is NOT a validated regulatory scoring
 * methodology — it exists so the dashboard shows a real, computed,
 * data-driven number instead of a hardcoded placeholder, and it is
 * isolated as one pure function with one call site
 * (src/server/dashboard/data.ts) specifically so it is easy to find and
 * replace wholesale once a real methodology is defined.
 *
 * INPUTS — plain non-negative counts, computed by the caller from real
 * data via the scoped data-access layer:
 *   - totalAudits / overdueAudits
 *   - totalIncidents / openIncidents      (status OPEN or INVESTIGATING)
 *   - totalPolicies / policiesNeedingReview (reviewDate in the past)
 *
 * FORMULA — a weighted blend of three "health" ratios, each clamped to
 * [0, 1]:
 *   auditHealth    = totalAudits    === 0 ? 1 : 1 - overdueAudits / totalAudits
 *   incidentHealth = totalIncidents === 0 ? 1 : 1 - min(openIncidents / totalIncidents, 1)
 *   policyHealth   = totalPolicies  === 0 ? 1 : 1 - policiesNeedingReview / totalPolicies
 *   score = round(100 * (0.40 * auditHealth + 0.35 * incidentHealth + 0.25 * policyHealth))
 *
 * A zero-denominator dimension (no rows of that type exist yet — e.g. no
 * Policies before Phase 4 ships policy management) defaults its health to
 * 1 (neutral/full marks) rather than penalising an org for a module it
 * hasn't started using.
 *
 * OUTPUT: an integer in [0, 100]. Higher is better.
 *
 * This formula is explicitly NOT: risk-weighted by incident severity,
 * aware of CQC domain/Reg 17 breakdown, or informed by inspection history.
 * Replace this function wholesale when a real methodology is defined —
 * that is the point of keeping it this small and isolated.
 */

export interface ComplianceScoreInputs {
  totalAudits: number;
  overdueAudits: number;
  totalIncidents: number;
  openIncidents: number;
  totalPolicies: number;
  policiesNeedingReview: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Pure function: same inputs always produce the same output, no I/O. */
export function computeComplianceScore(inputs: ComplianceScoreInputs): number {
  const auditHealth =
    inputs.totalAudits === 0 ? 1 : clamp(1 - inputs.overdueAudits / inputs.totalAudits, 0, 1);
  const incidentHealth =
    inputs.totalIncidents === 0
      ? 1
      : clamp(1 - Math.min(inputs.openIncidents / inputs.totalIncidents, 1), 0, 1);
  const policyHealth =
    inputs.totalPolicies === 0
      ? 1
      : clamp(1 - inputs.policiesNeedingReview / inputs.totalPolicies, 0, 1);

  const raw = 100 * (0.4 * auditHealth + 0.35 * incidentHealth + 0.25 * policyHealth);
  return Math.round(clamp(raw, 0, 100));
}

export type ComplianceBand = "good" | "warning" | "critical";

/** Pure function mapping a score to a coarse status band for display. */
export function complianceBand(score: number): ComplianceBand {
  if (score >= 85) return "good";
  if (score >= 60) return "warning";
  return "critical";
}
