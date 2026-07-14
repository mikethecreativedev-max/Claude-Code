import type { CQCDomain } from "@prisma/client";

/** A single questionnaire answer: 0 = No, 1 = Partial, 2 = Yes. */
export type ReadinessAnswerValue = 0 | 1 | 2;

export type ReadinessQuestion = {
  id: string;
  domain: CQCDomain;
  text: string;
};

/** Ordered so the UI can render domain-by-domain, matching CQC_DOMAINS. */
export const CQC_DOMAINS: readonly CQCDomain[] = [
  "SAFE",
  "EFFECTIVE",
  "CARING",
  "RESPONSIVE",
  "WELL_LED",
];

export const CQC_DOMAIN_LABELS: Record<CQCDomain, string> = {
  SAFE: "Safe",
  EFFECTIVE: "Effective",
  CARING: "Caring",
  RESPONSIVE: "Responsive",
  WELL_LED: "Well-led",
};

/**
 * V1 Inspection Readiness questionnaire — three yes/partial/no questions
 * per CQC domain (15 total), mapping to the five CQCKeyQuestion rows
 * seeded in Phase 1 (see prisma/seed.ts). This is a reasonable starting
 * question set for a V1 self-assessment tool, not a legally verified
 * inspection checklist — same caveat prisma/seed.ts already states for the
 * Reg 17 sub-clause text; revisit with real CQC guidance before relying on
 * scores for anything beyond internal readiness tracking.
 */
export const READINESS_QUESTIONS: readonly ReadinessQuestion[] = [
  // SAFE
  {
    id: "safe-1",
    domain: "SAFE",
    text: "Staff know how to report a safeguarding concern and who to escalate it to.",
  },
  {
    id: "safe-2",
    domain: "SAFE",
    text: "Incidents are logged, reviewed and learned from within a defined timeframe.",
  },
  {
    id: "safe-3",
    domain: "SAFE",
    text: "Infection prevention and control audits are completed on a scheduled basis.",
  },
  // EFFECTIVE
  {
    id: "effective-1",
    domain: "EFFECTIVE",
    text: "Care and treatment is delivered in line with current evidence-based guidance.",
  },
  {
    id: "effective-2",
    domain: "EFFECTIVE",
    text: "Staff receive supervision and appraisal on a regular, documented basis.",
  },
  {
    id: "effective-3",
    domain: "EFFECTIVE",
    text: "Outcomes are monitored and the findings are used to improve practice.",
  },
  // CARING
  {
    id: "caring-1",
    domain: "CARING",
    text: "Service users are involved in decisions about their own care.",
  },
  {
    id: "caring-2",
    domain: "CARING",
    text: "Privacy and dignity are consistently protected in service delivery.",
  },
  {
    id: "caring-3",
    domain: "CARING",
    text: "Feedback from service users is actively sought and acted upon.",
  },
  // RESPONSIVE
  {
    id: "responsive-1",
    domain: "RESPONSIVE",
    text: "Services are planned and delivered to meet the needs of the people using them.",
  },
  {
    id: "responsive-2",
    domain: "RESPONSIVE",
    text: "Complaints are investigated and responded to within a defined timescale.",
  },
  {
    id: "responsive-3",
    domain: "RESPONSIVE",
    text: "Reasonable adjustments are made for people with additional needs.",
  },
  // WELL_LED
  {
    id: "well_led-1",
    domain: "WELL_LED",
    text: "There is a clear governance structure with defined roles and accountability.",
  },
  {
    id: "well_led-2",
    domain: "WELL_LED",
    text: "Policies are reviewed on schedule and kept current.",
  },
  {
    id: "well_led-3",
    domain: "WELL_LED",
    text: "Risks are identified, recorded and mitigated through a risk register or equivalent.",
  },
] as const;
