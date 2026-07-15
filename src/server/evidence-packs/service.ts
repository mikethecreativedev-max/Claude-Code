import { scopedDb, scopedOrganisation } from "@/server/db/scoped-client";
import type { SessionUser } from "@/server/auth/session";
import { writeAuditLog } from "@/server/governance/audit-log";
import {
  evidencePackQuerySchema,
  type EvidencePackQuery,
} from "@/server/evidence-packs/schema";
import {
  buildEvidencePackData,
  describeDomainFilter,
  type DomainFilter,
  type EvidencePackData,
} from "@/server/evidence-packs/query";
import { renderEvidencePackPdf } from "@/server/evidence-packs/pdf";

function toDomainFilter(query: EvidencePackQuery): DomainFilter {
  const domain = query.domain;
  if (domain.taxonomy === "ALL") return { taxonomy: "ALL" };
  if (domain.taxonomy === "REG_CLAUSE") return { taxonomy: "REG_CLAUSE", regSubClauseId: domain.value };
  if (domain.taxonomy === "CQC_KEY_QUESTION")
    return { taxonomy: "CQC_KEY_QUESTION", cqcKeyQuestionId: domain.value };
  return { taxonomy: "SIX_PILLAR", sixPillarId: domain.value };
}

/**
 * Resolves the human-readable label for the domain filter. Reads the
 * (global, org-independent) taxonomy row through scopedDb(orgId) purely
 * for import-discipline consistency with the rest of the codebase (see
 * src/server/domain/reference-data.ts's identical rationale) — these
 * tables carry no orgId, so scopedDb passes the query through unscoped.
 */
async function resolveDomainLabel(orgId: string, domain: DomainFilter): Promise<string> {
  const db = scopedDb(orgId);
  if (domain.taxonomy === "REG_CLAUSE") {
    const row = await db.regulatorySubClause.findUnique({ where: { id: domain.regSubClauseId } });
    return describeDomainFilter(domain, { regSubClause: row });
  }
  if (domain.taxonomy === "CQC_KEY_QUESTION") {
    const row = await db.cQCKeyQuestion.findUnique({ where: { id: domain.cqcKeyQuestionId } });
    return describeDomainFilter(domain, { cqcKeyQuestion: row });
  }
  if (domain.taxonomy === "SIX_PILLAR") {
    const row = await db.sixPillar.findUnique({ where: { id: domain.sixPillarId } });
    return describeDomainFilter(domain, { sixPillar: row });
  }
  return describeDomainFilter(domain, {});
}

export type GenerateEvidencePackResult = {
  data: EvidencePackData;
  pdf: Buffer;
  filename: string;
};

/**
 * The single entry point for generating an Evidence Pack, once the caller
 * (a route handler or server action) has already run the mandatory
 * auth -> org -> RBAC -> tier chain and has a verified `session` in hand —
 * same calling convention as every other service module in this codebase
 * (e.g. src/server/risks/service.ts's createRiskEntry(session, ...)),
 * which is also what makes this directly unit-testable with a hand-built
 * SessionUser (see tests/phase6-evidence-packs.test.ts) without needing a
 * real NextAuth HTTP session.
 *
 * Validates input via Zod, resolves the org's own records exclusively
 * through scopedDb(session.orgId) (see src/server/evidence-packs/query.ts
 * for why that matters), writes a real AuditLogEntry (action EXPORT), and
 * renders a downloadable PDF.
 *
 * `rawQuery` is untrusted input (a parsed query-string object) — orgId is
 * NEVER read from it; it always comes from `session`.
 */
export async function generateEvidencePack(
  session: SessionUser,
  rawQuery: unknown
): Promise<GenerateEvidencePackResult> {
  const query = evidencePackQuerySchema.parse(rawQuery);
  const domain = toDomainFilter(query);

  const [org, domainLabel] = await Promise.all([
    scopedOrganisation(session.orgId).get(),
    resolveDomainLabel(session.orgId, domain),
  ]);
  const orgName = org?.name ?? session.orgId;

  const data = await buildEvidencePackData(
    session.orgId,
    orgName,
    `${session.email} (${session.role})`,
    domainLabel,
    { dateFrom: query.dateFrom, dateTo: query.dateTo, domain }
  );

  // Evidence pack generation itself is an auditable export action. There
  // is no dedicated "EVIDENCE_PACK" AuditableEntityType in the schema (see
  // prisma/schema.prisma's AuditableEntityType enum) — an evidence pack is
  // a compiled, on-the-fly report spanning many entities/modules, not a
  // single persisted row, so no existing entity type is a perfect fit.
  // ORGANISATION is the closest sensible choice: entityId is the caller's
  // own orgId, and afterSnapshot captures the report parameters and result
  // count so the log entry is still a meaningful audit trail of "who
  // exported what, covering which range/domain, how many records" — see
  // BUILD_CHECKLIST.md Phase 6 for this documented deviation.
  await writeAuditLog(session.orgId, {
    entityType: "ORGANISATION",
    entityId: session.orgId,
    userId: session.id,
    action: "EXPORT",
    afterSnapshot: {
      dateFrom: query.dateFrom.toISOString(),
      dateTo: query.dateTo.toISOString(),
      domainFilter: domain,
      domainLabel,
      recordCount: data.totalRecordCount,
      generatedBy: session.email,
    },
  });

  const pdf = await renderEvidencePackPdf(data);

  const safeOrgName = orgName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const filename = `evidence-pack-${safeOrgName}-${query.dateFrom.toISOString().slice(0, 10)}-to-${query.dateTo
    .toISOString()
    .slice(0, 10)}.pdf`;

  return { data, pdf, filename };
}
