"use server";

import { revalidatePath } from "next/cache";

import { scopedDb } from "@/server/db/scoped-client";
import { requireModulePermission } from "@/server/rbac/permissions";

import { computeReadinessScore, type ReadinessResponses } from "./scoring";
import { readinessSubmissionSchema } from "./validation";

export type SubmitReadinessResult =
  | { ok: true; id: string; overallScore: number }
  | { ok: false; error: string };

/**
 * Server action for the Inspection Readiness Scorer submission.
 *
 * Order of operations (mirrors the mandatory chain for every route
 * handler/server action in this codebase): auth -> org -> RBAC (via
 * requireModulePermission, READINESS_SCORER is a free-tier module so no
 * requireTier() call is needed) -> Zod validation of the input boundary ->
 * pure scoring -> write via scopedDb(session.orgId), which injects orgId
 * from the verified session, never from client input.
 */
export async function submitReadinessQuestionnaire(input: unknown): Promise<SubmitReadinessResult> {
  const session = await requireModulePermission("READINESS_SCORER", "edit");

  const parsed = readinessSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  const responses: ReadinessResponses = {};
  for (const r of parsed.data.responses) {
    responses[r.questionId] = r.value;
  }

  const { scorePerDomain, overallScore } = computeReadinessScore(responses);

  // scopedDb()'s extension injects `orgId` at runtime (see
  // src/server/db/scoped-client.ts), but its typings can't express that
  // statically — the underlying Prisma CreateInput type still requires
  // `orgId` in the object literal. The `as never` cast here is the same
  // narrow, documented escape hatch tests/tenant-isolation.test.ts already
  // uses for scopedDb() creates; it does not affect the runtime scoping
  // guarantee, which is enforced (and tested) at the scoped-client.ts layer.
  const created = await scopedDb(session.orgId).readinessScore.create({
    data: {
      siteId: parsed.data.siteId ?? null,
      questionnaireResponses: parsed.data.responses,
      scorePerDomain,
      overallScore,
    } as never,
  });

  revalidatePath("/dashboard/readiness/history");

  return { ok: true, id: created.id, overallScore };
}
