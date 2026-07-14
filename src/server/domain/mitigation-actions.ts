import { z } from "zod";

/**
 * `mitigationActions` (RiskEntry) and the analogous `followUpActions`
 * (Audit/Incident, owned by the other Phase 4 agent) are embedded `Json`
 * array fields on the parent record — no separate table/module, per
 * BUILD_CHECKLIST.md Phase 4. Shape: an array of
 * { description, ownerId, dueDate, status, completedDate }.
 *
 * Validated with Zod at every write boundary — never trust an
 * unvalidated JSON blob from client input.
 */
export const MITIGATION_ACTION_STATUSES = ["OPEN", "IN_PROGRESS", "DONE"] as const;
export type MitigationActionStatus = (typeof MITIGATION_ACTION_STATUSES)[number];

export const mitigationActionSchema = z
  .object({
    description: z.string().trim().min(1, "Mitigation action description is required"),
    ownerId: z.string().trim().min(1, "Mitigation action owner is required"),
    dueDate: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid due date" }),
    status: z.enum(MITIGATION_ACTION_STATUSES),
    completedDate: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid completed date" })
      .nullable()
      .optional(),
  })
  .strict();

export const mitigationActionsArraySchema = z.array(mitigationActionSchema).default([]);

export type MitigationAction = z.infer<typeof mitigationActionSchema>;

/**
 * Safely parses a RiskEntry.mitigationActions JSON column value (read
 * back from Postgres as an untyped Prisma.JsonValue) into a typed array
 * for rendering — falls back to [] rather than throwing, since this is a
 * read path, not a write-boundary validation.
 */
export type ResolvedMitigationAction = Omit<MitigationAction, "completedDate"> & {
  completedDate: string | null;
};

export function parseMitigationActionsJson(value: unknown): ResolvedMitigationAction[] {
  const result = mitigationActionsArraySchema.safeParse(value);
  if (!result.success) return [];
  return result.data.map((a) => ({ ...a, completedDate: a.completedDate ?? null }));
}
