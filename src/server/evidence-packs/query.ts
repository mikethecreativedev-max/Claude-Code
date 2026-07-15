import type { TaggableEntityType, AttachableEntityType } from "@prisma/client";

import { scopedDb } from "@/server/db/scoped-client";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE CROSS-TENANT RISK THIS FILE EXISTS TO CLOSE
 * ═══════════════════════════════════════════════════════════════════════
 * RegulatorySubClause / CQCKeyQuestion / SixPillar are global reference
 * tables (no orgId column — see prisma/schema.prisma's header comment).
 * BOTH demo orgs tag their own records against the exact same taxonomy
 * ROWS (e.g. the one "SAFE" CQCKeyQuestion row is shared, not duplicated
 * per org). A naive "find every record tagged to domain X" implementation
 * that starts from the taxonomy row (e.g.
 * `rawPrisma.cQCKeyQuestion.findUnique({ where: { id }, include: {
 * cqcKeyQuestionTags: true } })`) would return EVERY org's tags for that
 * row — a direct cross-tenant leak, and the single most important failure
 * mode for a feature whose entire purpose is producing a document handed
 * to an external CQC inspector.
 *
 * The fix: never query from the taxonomy side. Always query the tag
 * tables (RegClauseTag/CQCKeyQuestionTag/SixPillarTag) THROUGH
 * scopedDb(orgId) — which injects `orgId` into the `where` clause on every
 * call (see scoped-client.ts) — so even a `findMany({ where: {
 * cqcKeyQuestionId: <shared id> } })` can only ever return the calling
 * org's own tag rows, regardless of which other orgs also tagged that
 * same shared taxonomy row. This is proven by
 * tests/phase6-evidence-packs.test.ts's "cross-tenant" block.
 *
 * A second, narrower risk (the same one closed for Audits/Incidents in
 * src/server/governance/tagging.ts and for Risk/Policies in
 * src/server/domain/tag-integrity.ts): a tag row's *entityId* could in
 * principle point at another org's record even though the tag row's own
 * orgId is correct. This module does not need a bespoke read-side check
 * for that the way single-entity tag reads do, because every entity fetch
 * below (fetchAudits/fetchIncidents/etc.) ALSO goes through
 * scopedDb(orgId) filtered on `id: { in: ids }` — if a tag's entityId
 * pointed at a foreign-org record, that record simply would not be
 * returned by the scoped fetch (same mechanism
 * tests/phase4b-risks-policies.test.ts's read-side test relies on), so it
 * silently drops out of the pack rather than leaking.
 */

export type DomainFilter =
  | { taxonomy: "ALL" }
  | { taxonomy: "REG_CLAUSE"; regSubClauseId: string }
  | { taxonomy: "CQC_KEY_QUESTION"; cqcKeyQuestionId: string }
  | { taxonomy: "SIX_PILLAR"; sixPillarId: string };

export type EvidencePackParams = {
  dateFrom: Date;
  dateTo: Date;
  domain: DomainFilter;
};

export type EvidencePackRecord = {
  entityType: TaggableEntityType;
  id: string;
  title: string;
  date: Date;
  detailLines: string[];
  tagLabels: string[];
  attachments: { fileName: string; mimeType: string; sizeBytes: number }[];
};

export type EvidencePackSection = {
  entityType: TaggableEntityType;
  moduleLabel: string;
  records: EvidencePackRecord[];
};

export type EvidencePackData = {
  orgId: string;
  orgName: string;
  generatedAt: Date;
  generatedByLabel: string;
  dateFrom: Date;
  dateTo: Date;
  domainLabel: string;
  sections: EvidencePackSection[];
  totalRecordCount: number;
};

const MODULE_LABELS: Record<TaggableEntityType, string> = {
  AUDIT: "Audits",
  INCIDENT: "Incidents",
  EVENT: "Events",
  RISK_ENTRY: "Risk Register",
  POLICY: "Policies",
  FEEDBACK_COMPLAINT: "Feedback & Complaints",
};

// Fixed rendering order, independent of Object key ordering.
const MODULE_ORDER: TaggableEntityType[] = [
  "AUDIT",
  "INCIDENT",
  "EVENT",
  "RISK_ENTRY",
  "POLICY",
  "FEEDBACK_COMPLAINT",
];

export const CQC_DOMAIN_LABELS: Record<string, string> = {
  SAFE: "Safe",
  EFFECTIVE: "Effective",
  CARING: "Caring",
  RESPONSIVE: "Responsive",
  WELL_LED: "Well-led",
};

/** End-of-day (23:59:59.999 UTC) for an inclusive upper date-range bound,
 * so a record dated anywhere within `dateTo`'s calendar day is included,
 * not just ones at exactly midnight. */
function endOfDayUTC(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

type TagRef = {
  entityType: TaggableEntityType;
  entityId: string;
  labels: Set<string>;
};

/**
 * WRITE-TIME safety is not this function's job (tags are created by each
 * owning module's own tagging code, already covered by
 * src/server/governance/tagging.ts / src/server/domain/tag-integrity.ts).
 * This is the READ-time query for evidence packs specifically: collect
 * every (entityType, entityId) pair tagged to the requested domain (or
 * every tagged pair at all, for "ALL"), for the caller's org only.
 */
async function collectTaggedEntityRefs(
  orgId: string,
  domain: DomainFilter
): Promise<TagRef[]> {
  const db = scopedDb(orgId);
  const refs = new Map<string, TagRef>();

  function addRef(entityType: TaggableEntityType, entityId: string, label: string) {
    const key = `${entityType}:${entityId}`;
    const existing = refs.get(key);
    if (existing) {
      existing.labels.add(label);
    } else {
      refs.set(key, { entityType, entityId, labels: new Set([label]) });
    }
  }

  const wantReg = domain.taxonomy === "ALL" || domain.taxonomy === "REG_CLAUSE";
  const wantCqc = domain.taxonomy === "ALL" || domain.taxonomy === "CQC_KEY_QUESTION";
  const wantSix = domain.taxonomy === "ALL" || domain.taxonomy === "SIX_PILLAR";

  const [regTags, cqcTags, sixTags] = await Promise.all([
    wantReg
      ? db.regClauseTag.findMany({
          where: domain.taxonomy === "REG_CLAUSE" ? { regSubClauseId: domain.regSubClauseId } : {},
          include: { regSubClause: true },
        })
      : Promise.resolve([]),
    wantCqc
      ? db.cQCKeyQuestionTag.findMany({
          where:
            domain.taxonomy === "CQC_KEY_QUESTION" ? { cqcKeyQuestionId: domain.cqcKeyQuestionId } : {},
          include: { cqcKeyQuestion: true },
        })
      : Promise.resolve([]),
    wantSix
      ? db.sixPillarTag.findMany({
          where: domain.taxonomy === "SIX_PILLAR" ? { sixPillarId: domain.sixPillarId } : {},
          include: { sixPillar: true },
        })
      : Promise.resolve([]),
  ]);

  for (const t of regTags) {
    addRef(t.entityType, t.entityId, `Reg 17 ${t.regSubClause.subParagraph}`);
  }
  for (const t of cqcTags) {
    const label = CQC_DOMAIN_LABELS[t.cqcKeyQuestion.name] ?? t.cqcKeyQuestion.name;
    addRef(t.entityType, t.entityId, `CQC: ${label}`);
  }
  for (const t of sixTags) {
    addRef(t.entityType, t.entityId, `Six Pillar: ${t.sixPillar.description}`);
  }

  return Array.from(refs.values());
}

function idsFor(refs: TagRef[], entityType: TaggableEntityType): string[] {
  return refs.filter((r) => r.entityType === entityType).map((r) => r.entityId);
}

function labelMapFor(refs: TagRef[], entityType: TaggableEntityType): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const r of refs) {
    if (r.entityType === entityType) map.set(r.entityId, Array.from(r.labels));
  }
  return map;
}

async function fetchAttachmentsByEntityIds(
  orgId: string,
  entityType: AttachableEntityType,
  entityIds: string[]
): Promise<Map<string, { fileName: string; mimeType: string; sizeBytes: number }[]>> {
  const map = new Map<string, { fileName: string; mimeType: string; sizeBytes: number }[]>();
  if (entityIds.length === 0) return map;
  const rows = await scopedDb(orgId).attachment.findMany({
    where: { entityType, entityId: { in: entityIds } },
    orderBy: { uploadedAt: "desc" },
  });
  for (const row of rows) {
    const list = map.get(row.entityId) ?? [];
    list.push({ fileName: row.fileName, mimeType: row.mimeType, sizeBytes: row.sizeBytes });
    map.set(row.entityId, list);
  }
  return map;
}

async function fetchAudits(
  orgId: string,
  ids: string[],
  dateFrom: Date,
  dateToInclusive: Date,
  labels: Map<string, string[]>
): Promise<EvidencePackRecord[]> {
  if (ids.length === 0) return [];
  const rows = await scopedDb(orgId).audit.findMany({
    where: { id: { in: ids }, scheduledDate: { gte: dateFrom, lte: dateToInclusive } },
    include: { site: { select: { name: true } } },
  });
  const attachments = await fetchAttachmentsByEntityIds(orgId, "AUDIT", rows.map((r) => r.id));
  return rows.map((r) => ({
    entityType: "AUDIT" as const,
    id: r.id,
    title: `Audit: ${r.type}`,
    date: r.scheduledDate,
    detailLines: [
      `Status: ${r.status}`,
      `Scheduled date: ${r.scheduledDate.toISOString().slice(0, 10)}`,
      ...(r.completedDate ? [`Completed date: ${r.completedDate.toISOString().slice(0, 10)}`] : []),
      ...(r.resultScore != null ? [`Result score: ${r.resultScore}`] : []),
      `Site: ${r.site.name}`,
    ],
    tagLabels: labels.get(r.id) ?? [],
    attachments: attachments.get(r.id) ?? [],
  }));
}

async function fetchIncidents(
  orgId: string,
  ids: string[],
  dateFrom: Date,
  dateToInclusive: Date,
  labels: Map<string, string[]>
): Promise<EvidencePackRecord[]> {
  if (ids.length === 0) return [];
  const rows = await scopedDb(orgId).incident.findMany({
    where: { id: { in: ids }, dateTime: { gte: dateFrom, lte: dateToInclusive } },
    include: { site: { select: { name: true } } },
  });
  const attachments = await fetchAttachmentsByEntityIds(orgId, "INCIDENT", rows.map((r) => r.id));
  return rows.map((r) => ({
    entityType: "INCIDENT" as const,
    id: r.id,
    title: `Incident: ${r.severityGrading} severity`,
    date: r.dateTime,
    detailLines: [
      `Status: ${r.status}`,
      `Date: ${r.dateTime.toISOString().slice(0, 10)}`,
      `Severity grading: ${r.severityGrading}`,
      `PSIRF classification: ${r.psirfClassification}`,
      `Notifiable to CQC: ${r.notifiableToCQC ? "Yes" : "No"}`,
      `Description: ${r.description}`,
      `Site: ${r.site.name}`,
    ],
    tagLabels: labels.get(r.id) ?? [],
    attachments: attachments.get(r.id) ?? [],
  }));
}

async function fetchEvents(
  orgId: string,
  ids: string[],
  dateFrom: Date,
  dateToInclusive: Date,
  labels: Map<string, string[]>
): Promise<EvidencePackRecord[]> {
  if (ids.length === 0) return [];
  const rows = await scopedDb(orgId).event.findMany({
    where: { id: { in: ids }, dateTime: { gte: dateFrom, lte: dateToInclusive }, deletedAt: null },
    include: { site: { select: { name: true } } },
  });
  const attachments = await fetchAttachmentsByEntityIds(orgId, "EVENT", rows.map((r) => r.id));
  return rows.map((r) => ({
    entityType: "EVENT" as const,
    id: r.id,
    title: r.title,
    date: r.dateTime,
    detailLines: [
      `Event type: ${r.eventType}`,
      `Status: ${r.status}`,
      `Date: ${r.dateTime.toISOString().slice(0, 10)}`,
      `Description: ${r.description}`,
      `Site: ${r.site.name}`,
    ],
    tagLabels: labels.get(r.id) ?? [],
    attachments: attachments.get(r.id) ?? [],
  }));
}

async function fetchRiskEntries(
  orgId: string,
  ids: string[],
  dateFrom: Date,
  dateToInclusive: Date,
  labels: Map<string, string[]>
): Promise<EvidencePackRecord[]> {
  if (ids.length === 0) return [];
  const rows = await scopedDb(orgId).riskEntry.findMany({
    where: { id: { in: ids }, createdAt: { gte: dateFrom, lte: dateToInclusive } },
    include: { site: { select: { name: true } } },
  });
  const attachments = await fetchAttachmentsByEntityIds(orgId, "RISK_ENTRY", rows.map((r) => r.id));
  return rows.map((r) => ({
    entityType: "RISK_ENTRY" as const,
    id: r.id,
    title: r.title,
    date: r.createdAt,
    detailLines: [
      `Status: ${r.status}`,
      `Likelihood: ${r.likelihood} / Impact: ${r.impact} / Risk rating: ${r.riskRating}`,
      `Review date: ${r.reviewDate.toISOString().slice(0, 10)}`,
      `Description: ${r.description}`,
      `Site: ${r.site.name}`,
    ],
    tagLabels: labels.get(r.id) ?? [],
    attachments: attachments.get(r.id) ?? [],
  }));
}

async function fetchPolicies(
  orgId: string,
  ids: string[],
  dateFrom: Date,
  dateToInclusive: Date,
  labels: Map<string, string[]>
): Promise<EvidencePackRecord[]> {
  if (ids.length === 0) return [];
  const rows = await scopedDb(orgId).policy.findMany({
    where: { id: { in: ids }, createdAt: { gte: dateFrom, lte: dateToInclusive } },
    include: { site: { select: { name: true } } },
  });
  const attachments = await fetchAttachmentsByEntityIds(orgId, "POLICY", rows.map((r) => r.id));
  return rows.map((r) => ({
    entityType: "POLICY" as const,
    id: r.id,
    title: r.title,
    date: r.createdAt,
    detailLines: [
      `Status: ${r.status}`,
      `Version: ${r.versionNumber}`,
      `Review date: ${r.reviewDate.toISOString().slice(0, 10)}`,
      `Site: ${r.site.name}`,
    ],
    tagLabels: labels.get(r.id) ?? [],
    attachments: attachments.get(r.id) ?? [],
  }));
}

async function fetchFeedback(
  orgId: string,
  ids: string[],
  dateFrom: Date,
  dateToInclusive: Date,
  labels: Map<string, string[]>
): Promise<EvidencePackRecord[]> {
  if (ids.length === 0) return [];
  const rows = await scopedDb(orgId).feedbackComplaint.findMany({
    where: { id: { in: ids }, createdAt: { gte: dateFrom, lte: dateToInclusive }, deletedAt: null },
    include: { site: { select: { name: true } } },
  });
  const attachments = await fetchAttachmentsByEntityIds(
    orgId,
    "FEEDBACK_COMPLAINT",
    rows.map((r) => r.id)
  );
  return rows.map((r) => ({
    entityType: "FEEDBACK_COMPLAINT" as const,
    id: r.id,
    title: `${r.source === "PATIENT" ? "Patient" : "Staff"} feedback: ${r.category}`,
    date: r.createdAt,
    detailLines: [
      `Status: ${r.status}`,
      `Date: ${r.createdAt.toISOString().slice(0, 10)}`,
      `Description: ${r.description}`,
      ...(r.outcome ? [`Outcome: ${r.outcome}`] : []),
      `Site: ${r.site.name}`,
    ],
    tagLabels: labels.get(r.id) ?? [],
    attachments: attachments.get(r.id) ?? [],
  }));
}

export function describeDomainFilter(
  domain: DomainFilter,
  refData: {
    regSubClause?: { subParagraph: string; description: string } | null;
    cqcKeyQuestion?: { name: string; description: string } | null;
    sixPillar?: { description: string } | null;
  }
): string {
  if (domain.taxonomy === "ALL") return "All domains (every tagged record)";
  if (domain.taxonomy === "REG_CLAUSE") {
    return refData.regSubClause
      ? `Reg 17 ${refData.regSubClause.subParagraph} — ${refData.regSubClause.description}`
      : "Reg 17 sub-clause (not found)";
  }
  if (domain.taxonomy === "CQC_KEY_QUESTION") {
    const label = refData.cqcKeyQuestion ? CQC_DOMAIN_LABELS[refData.cqcKeyQuestion.name] ?? refData.cqcKeyQuestion.name : null;
    return label ? `CQC Key Question — ${label}` : "CQC Key Question (not found)";
  }
  return refData.sixPillar ? `Six Pillar — ${refData.sixPillar.description}` : "Six Pillar (not found)";
}

/**
 * The core query layer for Phase 6. Every underlying model read goes
 * through scopedDb(orgId) — no raw prisma calls — and orgId must be the
 * caller's own session-derived org (enforced by the caller, see
 * src/server/evidence-packs/service.ts). Returns records grouped by
 * source module, ready to render into a PDF.
 */
export async function buildEvidencePackData(
  orgId: string,
  orgName: string,
  generatedByLabel: string,
  domainLabel: string,
  params: EvidencePackParams
): Promise<EvidencePackData> {
  const dateToInclusive = endOfDayUTC(params.dateTo);

  const refs = await collectTaggedEntityRefs(orgId, params.domain);

  const [audits, incidents, events, riskEntries, policies, feedback] = await Promise.all([
    fetchAudits(orgId, idsFor(refs, "AUDIT"), params.dateFrom, dateToInclusive, labelMapFor(refs, "AUDIT")),
    fetchIncidents(
      orgId,
      idsFor(refs, "INCIDENT"),
      params.dateFrom,
      dateToInclusive,
      labelMapFor(refs, "INCIDENT")
    ),
    fetchEvents(orgId, idsFor(refs, "EVENT"), params.dateFrom, dateToInclusive, labelMapFor(refs, "EVENT")),
    fetchRiskEntries(
      orgId,
      idsFor(refs, "RISK_ENTRY"),
      params.dateFrom,
      dateToInclusive,
      labelMapFor(refs, "RISK_ENTRY")
    ),
    fetchPolicies(
      orgId,
      idsFor(refs, "POLICY"),
      params.dateFrom,
      dateToInclusive,
      labelMapFor(refs, "POLICY")
    ),
    fetchFeedback(
      orgId,
      idsFor(refs, "FEEDBACK_COMPLAINT"),
      params.dateFrom,
      dateToInclusive,
      labelMapFor(refs, "FEEDBACK_COMPLAINT")
    ),
  ]);

  const byType: Record<TaggableEntityType, EvidencePackRecord[]> = {
    AUDIT: audits,
    INCIDENT: incidents,
    EVENT: events,
    RISK_ENTRY: riskEntries,
    POLICY: policies,
    FEEDBACK_COMPLAINT: feedback,
  };

  const sections: EvidencePackSection[] = MODULE_ORDER.map((entityType) => ({
    entityType,
    moduleLabel: MODULE_LABELS[entityType],
    records: byType[entityType].sort((a, b) => b.date.getTime() - a.date.getTime()),
  }));

  const totalRecordCount = sections.reduce((sum, s) => sum + s.records.length, 0);

  return {
    orgId,
    orgName,
    generatedAt: new Date(),
    generatedByLabel,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    domainLabel,
    sections,
    totalRecordCount,
  };
}
