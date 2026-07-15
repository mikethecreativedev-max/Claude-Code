import type { CQCDomain } from "@prisma/client";

import { CQC_DOMAINS, READINESS_QUESTIONS, type ReadinessAnswerValue } from "./questions";

export type ReadinessResponses = Record<string, ReadinessAnswerValue>;
export type ScorePerDomain = Record<CQCDomain, number>;

export type ReadinessScoreResult = {
  scorePerDomain: ScorePerDomain;
  overallScore: number;
};

const MAX_ANSWER_VALUE = 2;

/**
 * Pure scoring function — no I/O, no session/clock/randomness dependence,
 * safe to unit test directly (see tests/phase3-free-tier.test.ts).
 *
 * Given a complete set of questionnaire responses (one 0/1/2 answer per
 * question id in READINESS_QUESTIONS), returns a 0-100 score per CQC
 * domain (the mean of that domain's answers, scaled to 0-100) and an
 * overall 0-100 score (the unweighted mean of the five domain scores, so
 * a domain with fewer questions isn't diluted relative to the others).
 *
 * Callers must validate completeness (all 15 question ids present, values
 * in range) via the Zod schema in src/server/readiness/validation.ts
 * before calling this — this function throws rather than silently
 * defaulting a missing answer, since a compliance score with a silently
 *-assumed answer would be worse than no score at all.
 */
export function computeReadinessScore(responses: ReadinessResponses): ReadinessScoreResult {
  const totals = new Map<CQCDomain, { sum: number; count: number }>();
  for (const domain of CQC_DOMAINS) totals.set(domain, { sum: 0, count: 0 });

  for (const question of READINESS_QUESTIONS) {
    const value = responses[question.id];
    if (value === undefined) {
      throw new Error(`computeReadinessScore: missing answer for question "${question.id}"`);
    }
    const bucket = totals.get(question.domain);
    if (!bucket) {
      throw new Error(`computeReadinessScore: unknown domain "${question.domain}"`);
    }
    bucket.sum += value;
    bucket.count += 1;
  }

  const scorePerDomain = {} as ScorePerDomain;
  for (const domain of CQC_DOMAINS) {
    const bucket = totals.get(domain);
    if (!bucket || bucket.count === 0) {
      throw new Error(`computeReadinessScore: no questions found for domain "${domain}"`);
    }
    scorePerDomain[domain] = round1((bucket.sum / (bucket.count * MAX_ANSWER_VALUE)) * 100);
  }

  const overallScore = round1(
    CQC_DOMAINS.reduce((acc, domain) => acc + scorePerDomain[domain], 0) / CQC_DOMAINS.length
  );

  return { scorePerDomain, overallScore };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
