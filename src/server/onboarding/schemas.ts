import { z } from "zod";

/**
 * Shared Zod input-boundary schemas for the Phase 2 onboarding flows
 * (sign-up, setup wizard, invite, invite-accept). These are the single
 * source of truth for validation on both the API route handlers and the
 * client-side forms that consume the same constant lists (SERVICE_TYPES,
 * INVITE_ROLES) — per BUILD_CHECKLIST.md's "Zod validation on every input
 * boundary" rule. This file has no server-only imports (no Prisma, no
 * session code) so it is safe to import from "use client" components too.
 */

export const signUpSchema = z.object({
  orgName: z.string().trim().min(2, "Organisation name must be at least 2 characters").max(200),
  ownerName: z.string().trim().min(2, "Name must be at least 2 characters").max(200),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  dpaAccepted: z
    .boolean()
    .refine((v) => v === true, { message: "You must accept the Data Processing Agreement to continue" }),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

// Service type is a closed set offered in the wizard's dropdown. There is
// no dedicated Site.serviceType column in schema.prisma (which this phase
// does not modify) — see the registeredActivities convention documented in
// setup-wizard.ts for how this value is actually persisted.
export const SERVICE_TYPES = [
  "GP Practice",
  "Dental Practice",
  "Aesthetic Clinic",
  "Care Home",
  "Private Hospital",
  "Other",
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const setupWizardSiteSchema = z.object({
  name: z.string().trim().min(2, "Site name must be at least 2 characters").max(200),
  address: z.string().trim().max(400).optional().or(z.literal("")),
  registeredActivities: z
    .array(z.string().trim().min(2).max(200))
    .min(1, "Add at least one registered activity"),
});

export const setupWizardSchema = z.object({
  orgName: z.string().trim().min(2).max(200),
  serviceType: z.enum(SERVICE_TYPES),
  sites: z.array(setupWizardSiteSchema).min(1, "Add at least one site"),
});
export type SetupWizardInput = z.infer<typeof setupWizardSchema>;

// Deliberately excludes OWNER (created only at sign-up) and BNCL_ADMIN
// (internal-only role, never invited by a client org).
export const INVITE_ROLES = ["REGISTERED_MANAGER", "STAFF"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(200),
  role: z.enum(INVITE_ROLES),
});
export type InviteInput = z.infer<typeof inviteSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(10),
  uid: z.string().min(1),
  password: z.string().min(8).max(200),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
