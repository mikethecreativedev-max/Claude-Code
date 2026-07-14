import { z } from "zod";

import { mitigationActionsArraySchema } from "@/server/domain/mitigation-actions";

// RISK_RATING SERVER AUTHORITY: the client is allowed to SEND a
// `riskRating` field (some forms may echo it back, or an attacker may try
// to spoof it), but it is validated here only as an optional number and
// is NEVER used — src/server/risks/service.ts always recomputes
// riskRating = likelihood * impact server-side and overwrites whatever
// the client sent. See BUILD_CHECKLIST.md Phase 4 acceptance criterion
// and tests/phase4b-risks-policies.test.ts for the spoofing test.
export const riskEntryInputSchema = z.object({
  siteId: z.string().trim().min(1, "Site is required"),
  title: z.string().trim().min(1, "Title is required").max(300),
  description: z.string().trim().min(1, "Description is required"),
  likelihood: z.coerce.number().int().min(1).max(5),
  impact: z.coerce.number().int().min(1).max(5),
  // Deliberately accepted-but-ignored — see comment above.
  riskRating: z.coerce.number().int().optional(),
  ownerId: z.string().trim().min(1, "Owner is required"),
  mitigationActions: mitigationActionsArraySchema,
  reviewDate: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid review date" }),
  status: z.enum(["OPEN", "MITIGATING", "CLOSED", "ACCEPTED"]).default("OPEN"),
});

export type RiskEntryInput = z.infer<typeof riskEntryInputSchema>;

export const riskApprovalSchema = z.object({
  status: z.enum(["OPEN", "MITIGATING", "CLOSED", "ACCEPTED"]),
});
