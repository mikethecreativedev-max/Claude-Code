import { z } from "zod";

import { rawPrisma } from "@/server/db/prisma";
import { requireAuth, type SessionUser } from "@/server/auth/session";

/**
 * THE ONLY UNSCOPED PATH IN THIS CODEBASE.
 *
 * Everything in src/server/bncl-admin/** operates across all orgs by
 * design (cross-org overview, Q&G Hub content management). It is
 * deliberately isolated in this module, is allowlisted in
 * scripts/check-tenant-isolation-imports.js to import rawPrisma directly,
 * and every entry point MUST call requireBnclAdmin() first — never call
 * rawPrisma directly from a route handler; always go through a function in
 * this module so the role check can't be forgotten at a call site.
 */
export class BnclAdminRequiredError extends Error {
  constructor() {
    super("This action requires the BNCL_ADMIN role");
    this.name = "BnclAdminRequiredError";
  }
}

/** Pure role check, factored out so it's testable without mocking a
 * NextAuth request context — see tests/tenant-isolation.test.ts. */
export function assertBnclAdmin(session: SessionUser): void {
  if (session.role !== "BNCL_ADMIN") {
    throw new BnclAdminRequiredError();
  }
}

export async function requireBnclAdmin(): Promise<SessionUser> {
  const session = await requireAuth();
  assertBnclAdmin(session);
  return session;
}

/**
 * Cross-org overview: engagement/health signal per client org.
 * Intentionally unscoped — reads every Organisation.
 */
export async function listOrgsForSuperAdmin() {
  await requireBnclAdmin();
  return rawPrisma.organisation.findMany({
    where: { isInternal: false, deletedAt: null },
    select: {
      id: true,
      name: true,
      subscriptionTier: true,
      billingStatus: true,
      createdAt: true,
      _count: { select: { users: true, sites: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listQGHubContent() {
  await requireBnclAdmin();
  return rawPrisma.qGHubContent.findMany({ orderBy: { updatedAt: "desc" } });
}

// Q&G Hub content — the ONLY write path. The client-facing read side lives
// in src/server/content/qg-hub.ts (published-only for non-admins). A
// non-BNCL_ADMIN must never be able to create/edit/publish content, even
// via a direct call to these functions — enforced below, not by hiding a
// button in the UI. See BUILD_CHECKLIST.md Phases 3 and 7.
//
// create/update take `session` explicitly (rather than calling
// requireBnclAdmin() internally, which would pull from the live NextAuth
// request context) so the RBAC gate is directly unit-testable without
// mocking a request — see tests/phase3-free-tier.test.ts. publish/
// unpublish/delete were added in Phase 7 and follow the same internal
// requireBnclAdmin() pattern as listOrgsForSuperAdmin/listQGHubContent
// above, since Phase 7's server actions call them straight from a request
// context and don't have a session object already in hand.
// ─────────────────────────────────────────────────────────────────────────

const qgHubContentInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  category: z.string().trim().min(1).max(200),
  contentType: z.enum(["ARTICLE", "LESSON"]),
  publishStatus: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  body: z.string().max(50_000).optional(),
});

export type QGHubContentInput = z.infer<typeof qgHubContentInputSchema>;

/**
 * Create Q&G Hub content. Takes `session` explicitly — see file header
 * comment above.
 */
export async function createQGHubContent(session: SessionUser, input: QGHubContentInput) {
  assertBnclAdmin(session);
  const data = qgHubContentInputSchema.parse(input);
  return rawPrisma.qGHubContent.create({ data });
}

/** Update (including publish/unpublish) Q&G Hub content. BNCL_ADMIN only. */
export async function updateQGHubContent(
  session: SessionUser,
  id: string,
  input: Partial<QGHubContentInput>
) {
  assertBnclAdmin(session);
  const data = qgHubContentInputSchema.partial().parse(input);
  return rawPrisma.qGHubContent.update({ where: { id }, data });
}

export async function publishQGHubContent(id: string) {
  await requireBnclAdmin();
  return rawPrisma.qGHubContent.update({ where: { id }, data: { publishStatus: "PUBLISHED" } });
}

export async function unpublishQGHubContent(id: string) {
  await requireBnclAdmin();
  return rawPrisma.qGHubContent.update({ where: { id }, data: { publishStatus: "DRAFT" } });
}

export async function deleteQGHubContent(id: string) {
  await requireBnclAdmin();
  return rawPrisma.qGHubContent.delete({ where: { id } });
}
