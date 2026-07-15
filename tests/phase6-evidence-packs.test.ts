import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { rawPrisma } from "@/server/db/prisma";
import type { SessionUser } from "@/server/auth/session";
import { buildEvidencePackData, type DomainFilter } from "@/server/evidence-packs/query";
import { generateEvidencePack } from "@/server/evidence-packs/service";

// This suite runs against a real, migrated, seeded Postgres database
// (bncl_test_phase6). It covers the four highest-risk acceptance criteria
// from BUILD_CHECKLIST.md Phase 6:
//   (a) the query layer only ever returns the caller's own org's tagged
//       records, even when both orgs tag the SAME shared, non-tenant-
//       scoped taxonomy row (the single most important test in this
//       phase — see src/server/evidence-packs/query.ts's header comment
//       for the exact leak this closes)
//   (b) date-range filtering excludes out-of-range records
//   (c) domain filtering excludes records tagged to a different domain
//   (d) generating a pack writes a real AuditLogEntry with action EXPORT

const ORG_A = "demo-org-a";
const ORG_B = "demo-org-b";

let sessionA: SessionUser;
let sessionB: SessionUser;
let siteA: string;
let siteB: string;

// Wide enough to cover every seeded fixture (see prisma/seed.ts) and any
// records this suite creates itself.
const WIDE_FROM = new Date("2020-01-01T00:00:00.000Z");
const WIDE_TO = new Date("2035-01-01T00:00:00.000Z");

beforeAll(async () => {
  const [ownerA, ownerB, siteARow, siteBRow] = await Promise.all([
    rawPrisma.user.findFirstOrThrow({ where: { orgId: ORG_A, role: "OWNER" } }),
    rawPrisma.user.findFirstOrThrow({ where: { orgId: ORG_B, role: "OWNER" } }),
    rawPrisma.site.findFirstOrThrow({ where: { orgId: ORG_A } }),
    rawPrisma.site.findFirstOrThrow({ where: { orgId: ORG_B } }),
  ]);
  sessionA = { id: ownerA.id, orgId: ORG_A, role: "OWNER", email: ownerA.email };
  sessionB = { id: ownerB.id, orgId: ORG_B, role: "OWNER", email: ownerB.email };
  siteA = siteARow.id;
  siteB = siteBRow.id;
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

function allRecords(data: Awaited<ReturnType<typeof buildEvidencePackData>>) {
  return data.sections.flatMap((s) => s.records);
}

describe("Phase 6 (a): cross-tenant isolation via the SAME shared taxonomy row", () => {
  it("Org A's evidence pack, filtered to a CQCKeyQuestion both orgs tag, contains ZERO Org B records", async () => {
    // The seed data (prisma/seed.ts) already has both demo orgs tagging
    // an Audit against the exact same global CQCKeyQuestion row
    // ("SAFE") — this is the real-world scenario the schema header
    // comment warns about, not a synthetic one. Confirm that shared-row
    // premise directly before trusting the isolation assertion below.
    const cqcSafe = await rawPrisma.cQCKeyQuestion.findUniqueOrThrow({ where: { name: "SAFE" } });
    const [tagA, tagB] = await Promise.all([
      rawPrisma.cQCKeyQuestionTag.findFirstOrThrow({
        where: { orgId: ORG_A, cqcKeyQuestionId: cqcSafe.id },
      }),
      rawPrisma.cQCKeyQuestionTag.findFirstOrThrow({
        where: { orgId: ORG_B, cqcKeyQuestionId: cqcSafe.id },
      }),
    ]);
    expect(tagA.cqcKeyQuestionId).toBe(tagB.cqcKeyQuestionId); // same shared row, confirmed

    const orgBAudit = await rawPrisma.audit.findUniqueOrThrow({ where: { id: tagB.entityId } });

    const domain: DomainFilter = { taxonomy: "CQC_KEY_QUESTION", cqcKeyQuestionId: cqcSafe.id };
    const packA = await buildEvidencePackData(ORG_A, "Org A", "tester", "CQC: Safe", {
      dateFrom: WIDE_FROM,
      dateTo: WIDE_TO,
      domain,
    });

    const recordsA = allRecords(packA);
    expect(recordsA.length).toBeGreaterThan(0); // sanity: Org A's own tagged record IS present

    // The actual leak assertion: no Org B record id, and no Org B title
    // text, anywhere in Org A's pack.
    expect(recordsA.some((r) => r.id === orgBAudit.id)).toBe(false);
    expect(recordsA.some((r) => r.title.includes(orgBAudit.type))).toBe(false);
    for (const r of recordsA) {
      expect(r.id.startsWith("demo-org-b")).toBe(false);
    }
  });

  it("symmetric: Org B's pack for the same shared CQC domain contains ZERO Org A records", async () => {
    const cqcSafe = await rawPrisma.cQCKeyQuestion.findUniqueOrThrow({ where: { name: "SAFE" } });
    const orgAAudit = await rawPrisma.audit.findFirstOrThrow({ where: { id: "demo-org-a-audit-1" } });

    const domain: DomainFilter = { taxonomy: "CQC_KEY_QUESTION", cqcKeyQuestionId: cqcSafe.id };
    const packB = await buildEvidencePackData(ORG_B, "Org B", "tester", "CQC: Safe", {
      dateFrom: WIDE_FROM,
      dateTo: WIDE_TO,
      domain,
    });

    const recordsB = allRecords(packB);
    expect(recordsB.length).toBeGreaterThan(0);
    expect(recordsB.some((r) => r.id === orgAAudit.id)).toBe(false);
    for (const r of recordsB) {
      expect(r.id.startsWith("demo-org-a")).toBe(false);
    }
  });

  it("Org A's ALL-domains pack contains zero Org B entity ids across every module section", async () => {
    const packA = await buildEvidencePackData(ORG_A, "Org A", "tester", "All domains", {
      dateFrom: WIDE_FROM,
      dateTo: WIDE_TO,
      domain: { taxonomy: "ALL" },
    });

    const recordsA = allRecords(packA);
    expect(recordsA.length).toBeGreaterThan(0);
    for (const r of recordsA) {
      expect(r.id.startsWith("demo-org-b")).toBe(false);
    }

    const orgBOwnerName = (await rawPrisma.user.findUniqueOrThrow({ where: { id: sessionB.id } })).name;
    const serialized = JSON.stringify(packA);
    expect(serialized).not.toContain("demo-org-b");
    expect(serialized).not.toContain("Riverside Dental");
    expect(serialized).not.toContain(orgBOwnerName);
  });

  it("a directly-inserted tag with Org A's own orgId but pointing entityId at Org B's RiskEntry cannot surface Org B content in Org A's pack", async () => {
    // Mirrors tests/phase4b-risks-policies.test.ts's "mismatched tag"
    // scenario: bypass the write-side guard entirely via rawPrisma to
    // simulate a bug elsewhere, and prove the READ side still can't be
    // tricked into rendering the foreign record.
    const sixPillar = await rawPrisma.sixPillar.findFirstOrThrow({
      where: { name: "RISK_MANAGEMENT" },
    });
    const orgBRisk = await rawPrisma.riskEntry.findFirstOrThrow({ where: { orgId: ORG_B } });

    const badTag = await rawPrisma.sixPillarTag.create({
      data: {
        orgId: ORG_A,
        entityType: "RISK_ENTRY",
        entityId: orgBRisk.id,
        sixPillarId: sixPillar.id,
        taggedById: sessionA.id,
      },
    });

    try {
      const domain: DomainFilter = { taxonomy: "SIX_PILLAR", sixPillarId: sixPillar.id };
      const packA = await buildEvidencePackData(ORG_A, "Org A", "tester", "Six Pillar", {
        dateFrom: WIDE_FROM,
        dateTo: WIDE_TO,
        domain,
      });
      const recordsA = allRecords(packA);
      // The bad tag's entityId belongs to Org B, so the record fetch
      // (which itself goes through scopedDb(ORG_A)) must not resolve it —
      // it should simply be absent, not present with Org B's data.
      expect(recordsA.some((r) => r.id === orgBRisk.id)).toBe(false);
    } finally {
      await rawPrisma.sixPillarTag.delete({ where: { id: badTag.id } });
    }
  });
});

describe("Phase 6 (b): date-range filtering", () => {
  it("excludes a tagged record whose date falls outside the requested range", async () => {
    const farFutureEvent = await rawPrisma.event.create({
      data: {
        orgId: ORG_A,
        siteId: siteA,
        eventType: "Staff meeting",
        title: "Out-of-range fixture event",
        description: "Should never appear when the date filter excludes it.",
        dateTime: new Date("2099-06-01T00:00:00.000Z"),
        status: "OPEN",
      },
    });
    const regClause = await rawPrisma.regulatorySubClause.findFirstOrThrow();
    const tag = await rawPrisma.regClauseTag.create({
      data: {
        orgId: ORG_A,
        entityType: "EVENT",
        entityId: farFutureEvent.id,
        regSubClauseId: regClause.id,
        taggedById: sessionA.id,
      },
    });

    try {
      // In-range query: the far-future event must be excluded.
      const inRangePack = await buildEvidencePackData(ORG_A, "Org A", "tester", "all", {
        dateFrom: WIDE_FROM,
        dateTo: new Date("2030-01-01T00:00:00.000Z"),
        domain: { taxonomy: "ALL" },
      });
      expect(allRecords(inRangePack).some((r) => r.id === farFutureEvent.id)).toBe(false);

      // Widen the range to include it: now it must appear (proves the
      // exclusion above was the date filter working, not some other bug
      // hiding the record entirely).
      const widePack = await buildEvidencePackData(ORG_A, "Org A", "tester", "all", {
        dateFrom: WIDE_FROM,
        dateTo: new Date("2099-12-31T00:00:00.000Z"),
        domain: { taxonomy: "ALL" },
      });
      expect(allRecords(widePack).some((r) => r.id === farFutureEvent.id)).toBe(true);
    } finally {
      await rawPrisma.regClauseTag.delete({ where: { id: tag.id } });
      await rawPrisma.event.delete({ where: { id: farFutureEvent.id } });
    }
  });
});

describe("Phase 6 (c): domain filtering", () => {
  it("excludes a record tagged only to a different domain than the one requested", async () => {
    const cqcCaring = await rawPrisma.cQCKeyQuestion.findUniqueOrThrow({ where: { name: "CARING" } });
    const cqcEffective = await rawPrisma.cQCKeyQuestion.findUniqueOrThrow({
      where: { name: "EFFECTIVE" },
    });

    const feedback = await rawPrisma.feedbackComplaint.create({
      data: {
        orgId: ORG_A,
        siteId: siteA,
        source: "STAFF",
        category: "Domain-filter fixture",
        description: "Tagged only to CARING; must not appear when filtering by EFFECTIVE.",
        status: "OPEN",
      },
    });
    const tag = await rawPrisma.cQCKeyQuestionTag.create({
      data: {
        orgId: ORG_A,
        entityType: "FEEDBACK_COMPLAINT",
        entityId: feedback.id,
        cqcKeyQuestionId: cqcCaring.id,
        taggedById: sessionA.id,
      },
    });

    try {
      const wrongDomainPack = await buildEvidencePackData(ORG_A, "Org A", "tester", "Effective", {
        dateFrom: WIDE_FROM,
        dateTo: WIDE_TO,
        domain: { taxonomy: "CQC_KEY_QUESTION", cqcKeyQuestionId: cqcEffective.id },
      });
      expect(allRecords(wrongDomainPack).some((r) => r.id === feedback.id)).toBe(false);

      const rightDomainPack = await buildEvidencePackData(ORG_A, "Org A", "tester", "Caring", {
        dateFrom: WIDE_FROM,
        dateTo: WIDE_TO,
        domain: { taxonomy: "CQC_KEY_QUESTION", cqcKeyQuestionId: cqcCaring.id },
      });
      expect(allRecords(rightDomainPack).some((r) => r.id === feedback.id)).toBe(true);

      const allDomainsPack = await buildEvidencePackData(ORG_A, "Org A", "tester", "All", {
        dateFrom: WIDE_FROM,
        dateTo: WIDE_TO,
        domain: { taxonomy: "ALL" },
      });
      expect(allRecords(allDomainsPack).some((r) => r.id === feedback.id)).toBe(true);
    } finally {
      await rawPrisma.cQCKeyQuestionTag.delete({ where: { id: tag.id } });
      await rawPrisma.feedbackComplaint.delete({ where: { id: feedback.id } });
    }
  });
});

describe("Phase 6 (d): generating a pack writes a real AuditLogEntry (action EXPORT)", () => {
  it("generateEvidencePack writes an EXPORT AuditLogEntry with a non-trivial afterSnapshot, and returns a real PDF", async () => {
    const before = await rawPrisma.auditLogEntry.count({
      where: { orgId: ORG_A, action: "EXPORT" },
    });

    const result = await generateEvidencePack(sessionA, {
      dateFrom: "2020-01-01",
      dateTo: "2035-01-01",
      domain: "ALL",
    });

    const after = await rawPrisma.auditLogEntry.count({ where: { orgId: ORG_A, action: "EXPORT" } });
    expect(after).toBe(before + 1);

    const entry = await rawPrisma.auditLogEntry.findFirstOrThrow({
      where: { orgId: ORG_A, action: "EXPORT" },
      orderBy: { timestamp: "desc" },
    });
    expect(entry.userId).toBe(sessionA.id);
    expect(entry.entityId).toBe(ORG_A);
    const snapshot = entry.afterSnapshot as Record<string, unknown>;
    expect(snapshot.recordCount).toBe(result.data.totalRecordCount);
    expect(snapshot.generatedBy).toBe(sessionA.email);

    // Real PDF, not a stub: magic bytes + non-trivial size.
    expect(result.pdf.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(result.pdf.length).toBeGreaterThan(500);
    expect(result.filename.endsWith(".pdf")).toBe(true);
  });

  it("rejects an invalid domain filter value (Zod validation at the input boundary)", async () => {
    await expect(
      generateEvidencePack(sessionA, {
        dateFrom: "2020-01-01",
        dateTo: "2035-01-01",
        domain: "NOT_A_REAL_TAXONOMY:someid",
      })
    ).rejects.toThrow();
  });

  it("rejects dateFrom after dateTo", async () => {
    await expect(
      generateEvidencePack(sessionA, {
        dateFrom: "2030-01-01",
        dateTo: "2020-01-01",
        domain: "ALL",
      })
    ).rejects.toThrow();
  });
});

describe("Phase 6: end-to-end cross-tenant PDF byte content check", () => {
  it("Org A's generated PDF bytes contain zero Org B identifiers, and vice versa", async () => {
    const [packA, packB] = await Promise.all([
      generateEvidencePack(sessionA, { dateFrom: "2020-01-01", dateTo: "2035-01-01", domain: "ALL" }),
      generateEvidencePack(sessionB, { dateFrom: "2020-01-01", dateTo: "2035-01-01", domain: "ALL" }),
    ]);

    const pdfAText = packA.pdf.toString("latin1");
    const pdfBText = packB.pdf.toString("latin1");

    expect(pdfAText.startsWith("%PDF")).toBe(true);
    expect(pdfBText.startsWith("%PDF")).toBe(true);

    // Org names must appear in each org's OWN pack (sanity: the pack
    // really does contain real content)...
    expect(pdfAText).toContain("Greenfield Aesthetic Clinic");
    expect(pdfBText).toContain("Riverside Dental Practice");

    // ...and must NEVER appear in the OTHER org's pack.
    expect(pdfAText).not.toContain("Riverside Dental Practice");
    expect(pdfAText).not.toContain(ORG_B);
    expect(pdfBText).not.toContain("Greenfield Aesthetic Clinic");
    expect(pdfBText).not.toContain(ORG_A);
  });
});
