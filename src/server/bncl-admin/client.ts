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

// ─────────────────────────────────────────────────────────────────────────
// Q&G Hub content management (Phase 7 write side — listQGHubContent above
// was already the read path). QGHubContent is global, not tenant-scoped
// (see prisma/schema.prisma), and per the schema's own comment is
// "manageable only via the BNCL super-admin module" — every function below
// calls requireBnclAdmin() itself, first, so the check can never be
// forgotten at a call site (same discipline as the rest of this file).
// ─────────────────────────────────────────────────────────────────────────

const qgContentCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  category: z.string().trim().min(1).max(200),
  contentType: z.enum(["ARTICLE", "LESSON"]),
  body: z.string().max(50_000).optional(),
});

const qgContentUpdateSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(300).optional(),
  category: z.string().trim().min(1).max(200).optional(),
  contentType: z.enum(["ARTICLE", "LESSON"]).optional(),
  body: z.string().max(50_000).optional(),
});

export async function createQGHubContent(input: unknown) {
  await requireBnclAdmin();
  const data = qgContentCreateSchema.parse(input);
  return rawPrisma.qGHubContent.create({ data: { ...data, publishStatus: "DRAFT" } });
}

export async function updateQGHubContent(input: unknown) {
  await requireBnclAdmin();
  const { id, ...data } = qgContentUpdateSchema.parse(input);
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
