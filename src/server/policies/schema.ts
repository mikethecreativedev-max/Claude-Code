import { z } from "zod";

export const policyInputSchema = z.object({
  siteId: z.string().trim().min(1, "Site is required"),
  title: z.string().trim().min(1, "Title is required").max(300),
  reviewDate: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid review date" }),
  status: z.enum(["ACTIVE", "UNDER_REVIEW", "SUPERSEDED"]).default("ACTIVE"),
});

export type PolicyInput = z.infer<typeof policyInputSchema>;

// Minimal local-disk upload stub for V1 — see attachments.ts. Real S3
// integration is a follow-up (BUILD_CHECKLIST.md Phase 4 accepts a stub
// for this phase's scope: "For V1 you do not need real S3 integration").
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20MB
export const attachmentMetaSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(127),
  sizeBytes: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
});
