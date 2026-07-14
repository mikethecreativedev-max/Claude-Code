import bcrypt from "bcryptjs";

import { rawPrisma } from "@/server/db/prisma";
import { scopedDb } from "@/server/db/scoped-client";
import { signUpSchema } from "@/server/onboarding/schemas";

/**
 * THE SIGN-UP ORG-CREATION PATH — the other deliberately-narrow unscoped
 * write in this codebase (alongside src/server/bncl-admin/client.ts).
 *
 * Creating a brand-new Organisation necessarily happens before any orgId
 * exists to scope a query by, so the ONE rawPrisma.organisation.create
 * call below is legitimate — the same rationale prisma/seed.ts uses for
 * its org-creation helpers. This file is allowlisted in
 * scripts/check-tenant-isolation-imports.js for exactly that reason.
 *
 * Everything downstream of that one call — the owner User, the DPA row,
 * the audit log entry — goes through scopedDb(newOrg.id) once the org
 * exists, so this module's raw-tenant-write footprint is exactly one call,
 * not "the whole sign-up flow."
 */

export class EmailAlreadyInUseError extends Error {
  constructor() {
    super("An account with that email already exists");
    this.name = "EmailAlreadyInUseError";
  }
}

// V1: a single fixed DPA version string. Revisit if/when DPA content is
// versioned for real (Phase 7 "Data protection centre").
const DPA_VERSION = "v1-2026";

export type SignUpResult = {
  orgId: string;
  userId: string;
  email: string;
};

/**
 * Creates a new Organisation + first Owner User + a DataProcessingAgreement
 * acceptance record, in one flow, with zero manual DB intervention.
 *
 * Auth -> org -> RBAC: intentionally NOT gated by requireAuth() — there is
 * no session yet; this function is how a session comes to exist. It is
 * called only from the public POST /api/signup route. No client input is
 * ever trusted for orgId or role: the org is always freshly created here,
 * and the caller is always made OWNER of it, never any other role.
 */
export async function signUpOrganisation(input: unknown): Promise<SignUpResult> {
  const parsed = signUpSchema.parse(input);

  const existing = await rawPrisma.user.findUnique({ where: { email: parsed.email } });
  if (existing) {
    throw new EmailAlreadyInUseError();
  }

  const passwordHash = await bcrypt.hash(parsed.password, 10);

  // Organisation carries no orgId column of its own (it IS the tenant
  // root), so it is never in scoped-client.ts's TENANT_MODELS set and can
  // never be created "through" scopedDb — this is the one legitimate
  // rawPrisma call documented above.
  const org = await rawPrisma.organisation.create({
    data: {
      name: parsed.orgName,
      subscriptionTier: "FREE",
      billingStatus: "TRIALING",
    },
  });

  const db = scopedDb(org.id);

  const owner = await db.user.create({
    data: {
      orgId: org.id,
      name: parsed.ownerName,
      email: parsed.email,
      passwordHash,
      role: "OWNER",
      status: "ACTIVE",
      emailVerified: new Date(),
    },
  });

  await db.dataProcessingAgreement.create({
    data: {
      orgId: org.id,
      signedById: owner.id,
      signedDate: new Date(),
      version: DPA_VERSION,
    },
  });

  await db.auditLogEntry.create({
    data: {
      orgId: org.id,
      entityType: "ORGANISATION",
      entityId: org.id,
      userId: owner.id,
      action: "CREATE",
      afterSnapshot: { name: org.name, ownerEmail: owner.email },
    },
  });

  return { orgId: org.id, userId: owner.id, email: owner.email };
}
