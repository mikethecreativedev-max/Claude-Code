import { z } from "zod";

const isoDateString = z
  .string()
  .min(1, "Date is required")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date");

// Same embedded shape as Audit.followUpActions — see
// src/server/audits/schemas.ts and prisma/schema.prisma's comment on
// Incident.followUpActions. Deliberately duplicated rather than shared
// across modules so Audits and Incidents can evolve independently without
// a cross-module coupling; the shape happens to match today.
export const FollowUpActionSchema = z.object({
  description: z.string().min(1, "Description is required").max(2000),
  ownerId: z.string().min(1, "Owner is required"),
  dueDate: isoDateString,
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE"]),
  completedDate: isoDateString.nullable().optional(),
});

export const FollowUpActionsArraySchema = z.array(FollowUpActionSchema).max(100).default([]);

const SEVERITY_VALUES = ["NO_HARM", "LOW", "MODERATE", "SEVERE", "DEATH"] as const;

export const CreateIncidentSchema = z.object({
  siteId: z.string().min(1, "Site is required"),
  dateTime: isoDateString,
  description: z.string().min(1, "Description is required").max(10000),
  // The reporter must explicitly confirm they've seen the anonymisation
  // guidance before the description can be submitted — UI enforces this
  // as a required checkbox; the server independently rejects submissions
  // where it is not true, rather than trusting client-side disabling of
  // the submit button.
  anonymisationAcknowledged: z.literal(true, {
    errorMap: () => ({
      message: "You must confirm the anonymisation guidance before submitting.",
    }),
  }),
  severityGrading: z.enum(SEVERITY_VALUES),
  psirfClassification: z.string().min(1, "PSIRF classification is required").max(200),
  notifiableToCQC: z.boolean(),
});
export type CreateIncidentInput = z.infer<typeof CreateIncidentSchema>;

export const EditIncidentSchema = z.object({
  id: z.string().min(1),
  dateTime: isoDateString,
  description: z.string().min(1, "Description is required").max(10000),
  severityGrading: z.enum(SEVERITY_VALUES),
  psirfClassification: z.string().min(1, "PSIRF classification is required").max(200),
  notifiableToCQC: z.boolean(),
  followUpActions: FollowUpActionsArraySchema,
});
export type EditIncidentInput = z.infer<typeof EditIncidentSchema>;

export const CloseIncidentSchema = z.object({
  id: z.string().min(1),
});
export type CloseIncidentInput = z.infer<typeof CloseIncidentSchema>;

export const StartInvestigationIncidentSchema = z.object({
  id: z.string().min(1),
});

export const TagIncidentRegClauseSchema = z.object({
  incidentId: z.string().min(1),
  regSubClauseId: z.string().min(1),
});

export const TagIncidentCQCKeyQuestionSchema = z.object({
  incidentId: z.string().min(1),
  cqcKeyQuestionId: z.string().min(1),
});

export const TagIncidentSixPillarSchema = z.object({
  incidentId: z.string().min(1),
  sixPillarId: z.string().min(1),
});
