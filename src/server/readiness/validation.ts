import { z } from "zod";

import { READINESS_QUESTIONS } from "./questions";

const KNOWN_QUESTION_IDS = new Set(READINESS_QUESTIONS.map((q) => q.id));

/**
 * Zod validation for the readiness questionnaire submission boundary (used
 * by the submitReadinessQuestionnaire server action). Requires exactly one
 * answer per known question id, each answer in {0, 1, 2}, no duplicates,
 * no unknown question ids.
 */
export const readinessSubmissionSchema = z.object({
  siteId: z.string().min(1).optional(),
  responses: z
    .array(
      z.object({
        questionId: z.string().refine((id) => KNOWN_QUESTION_IDS.has(id), {
          message: "Unknown question id",
        }),
        value: z.union([z.literal(0), z.literal(1), z.literal(2)]),
      })
    )
    .length(READINESS_QUESTIONS.length, {
      message: `Expected exactly ${READINESS_QUESTIONS.length} answers`,
    })
    .refine((arr) => new Set(arr.map((a) => a.questionId)).size === arr.length, {
      message: "Duplicate question ids in submission",
    })
    .refine((arr) => arr.every((a) => KNOWN_QUESTION_IDS.has(a.questionId)), {
      message: "Unknown question id in submission",
    })
    .refine(
      (arr) => {
        const ids = new Set(arr.map((a) => a.questionId));
        return READINESS_QUESTIONS.every((q) => ids.has(q.id));
      },
      { message: "Submission is missing an answer for one or more questions" }
    ),
});

export type ReadinessSubmissionInput = z.infer<typeof readinessSubmissionSchema>;
