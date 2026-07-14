import { rawPrisma } from "@/server/db/prisma";

/**
 * RegulatorySubClause, CQCKeyQuestion and SixPillar are global seed/
 * reference tables — no orgId column, identical across every tenant (see
 * prisma/schema.prisma's header comment: "global seed/reference tables (no
 * orgId — identical across all tenants)"). Reading them via rawPrisma here
 * is not a tenant-isolation concern, for the same reason
 * src/server/rbac/permissions.ts reads RolePermission via rawPrisma: these
 * tables carry no orgId and are not in scoped-client.ts's TENANT_MODELS
 * set, so scopedDb() would not apply any scoping to them anyway.
 *
 * This file is explicitly added to the ALLOWLIST in
 * scripts/check-tenant-isolation-imports.js for that reason, mirroring the
 * precedent set for permissions.ts — if any of these tables ever becomes
 * tenant-scoped, that script's failure is what should force this file to
 * be reworked through scopedDb().
 */
export async function listRegulatorySubClauses() {
  return rawPrisma.regulatorySubClause.findMany({ orderBy: { subParagraph: "asc" } });
}

export async function listCQCKeyQuestions() {
  return rawPrisma.cQCKeyQuestion.findMany({ orderBy: { name: "asc" } });
}

export async function listSixPillars() {
  return rawPrisma.sixPillar.findMany({ orderBy: { name: "asc" } });
}
