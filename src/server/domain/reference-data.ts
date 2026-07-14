import { scopedDb } from "@/server/db/scoped-client";

/**
 * Shared lookups for the Risk Register / Policies forms (site picker,
 * owner picker, taxonomy tag pickers). All routed through scopedDb(orgId)
 * — including the taxonomy tables, even though RegulatorySubClause /
 * CQCKeyQuestion / SixPillar are global (no orgId column) and scopedDb's
 * tenant-scope extension passes them through unchanged. Going through
 * scopedDb here (rather than importing rawPrisma) keeps this file outside
 * scripts/check-tenant-isolation-imports.js's allowlist, consistent with
 * "no raw prisma.<model> calls anywhere except scoped-client.ts and
 * bncl-admin".
 */

export async function listOrgSites(orgId: string) {
  const db = scopedDb(orgId);
  return db.site.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
}

export async function listOrgUsers(orgId: string) {
  const db = scopedDb(orgId);
  return db.user.findMany({
    where: { deletedAt: null, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });
}

export async function listTaxonomy(orgId: string) {
  const db = scopedDb(orgId);
  const [regClauses, cqcKeyQuestions, sixPillars] = await Promise.all([
    db.regulatorySubClause.findMany({ orderBy: [{ regulation: "asc" }, { subParagraph: "asc" }] }),
    db.cQCKeyQuestion.findMany({ orderBy: { name: "asc" } }),
    db.sixPillar.findMany({ orderBy: { name: "asc" } }),
  ]);
  return { regClauses, cqcKeyQuestions, sixPillars };
}
