import { z } from "zod";

const isoDateString = z
  .string()
  .min(1, "Date is required")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date");

// Embedded follow-up action shape, per prisma/schema.prisma's comment on
// Audit.followUpActions: { description, ownerId, dueDate, status,
// completedDate }. Not a separate table — validated here before ever being
// written into the Json column.
export const FollowUpActionSchema = z.object({
  description: z.string().min(1, "Description is required").max(2000),
  ownerId: z.string().min(1, "Owner is required"),
  dueDate: isoDateString,
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE"]),
  completedDate: isoDateString.nullable().optional(),
});

export const FollowUpActionsArraySchema = z.array(FollowUpActionSchema).max(100).default([]);

export const CreateAuditSchema = z.object({
  siteId: z.string().min(1, "Site is required"),
  type: z.string().min(1, "Audit type is required").max(200),
  scheduledDate: isoDateString,
  sixPillarId: z.string().min(1).optional().nullable(),
});
export type CreateAuditInput = z.infer<typeof CreateAuditSchema>;

export const EditAuditSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1, "Audit type is required").max(200),
  scheduledDate: isoDateString,
  sixPillarId: z.string().min(1).optional().nullable(),
  resultScore: z.coerce.number().int().min(0).max(100).optional().nullable(),
  followUpActions: FollowUpActionsArraySchema,
});
export type EditAuditInput = z.infer<typeof EditAuditSchema>;

export const CompleteAuditSchema = z.object({
  id: z.string().min(1),
  resultScore: z.coerce.number().int().min(0).max(100).optional().nullable(),
});
export type CompleteAuditInput = z.infer<typeof CompleteAuditSchema>;

export const VoidAuditSchema = z.object({
  id: z.string().min(1),
});

export const TagAuditRegClauseSchema = z.object({
  auditId: z.string().min(1),
  regSubClauseId: z.string().min(1),
});

export const TagAuditCQCKeyQuestionSchema = z.object({
  auditId: z.string().min(1),
  cqcKeyQuestionId: z.string().min(1),
});
