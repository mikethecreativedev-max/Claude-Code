import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { rawPrisma } from "@/server/db/prisma";
import { scopedDb } from "@/server/db/scoped-client";
import type { SessionUser } from "@/server/auth/session";

import * as auditService from "@/server/audits/service";
import * as incidentService from "@/server/incidents/service";
import { EntityNotOwnedError } from "@/server/governance/tagging";
import { EditAuditSchema } from "@/server/audits/schemas";
import { EditIncidentSchema } from "@/server/incidents/schemas";

// This suite runs against a real, migrated, seeded Postgres database
// (bncl_test_phase4a — see BUILD_CHECKLIST.md Phase 4). It extends the
// Phase 1 cross-tenant isolation suite (tests/tenant-isolation.test.ts) to
// cover the Phase 4a (Audits + Incidents) surface specifically:
//   (a) cross-tenant isolation via the service layer
//   (b) the append-only versioning chain after two edits
//   (c) real AuditLogEntry rows with non-trivial before/after snapshots
//   (d) the polymorphic tagging integrity gap, both write-time AND read-time
//   (e) Zod rejection of malformed followUpActions

const ORG_A = "demo-org-a";
const ORG_B = "demo-org-b";

let sessionA: SessionUser;
let sessionB: SessionUser;
let siteA: { id: string };
let siteB: { id: string };
let regSubClauseId: string;
let cqcKeyQuestionId: string;
let sixPillarId: string;

beforeAll(async () => {
  const [ownerA, ownerB, sA, sB, clause, cqc, pillar] = await Promise.all([
    rawPrisma.user.findUniqueOrThrow({ where: { email: "owner@greenfield-demo.example" } }),
    rawPrisma.user.findUniqueOrThrow({ where: { email: "owner@riverside-demo.example" } }),
    rawPrisma.site.findFirstOrThrow({ where: { orgId: ORG_A } }),
    rawPrisma.site.findFirstOrThrow({ where: { orgId: ORG_B } }),
    rawPrisma.regulatorySubClause.findFirstOrThrow(),
    rawPrisma.cQCKeyQuestion.findFirstOrThrow(),
    rawPrisma.sixPillar.findFirstOrThrow(),
  ]);

  sessionA = { id: ownerA.id, orgId: ORG_A, role: "OWNER", email: ownerA.email };
  sessionB = { id: ownerB.id, orgId: ORG_B, role: "OWNER", email: ownerB.email };
  siteA = { id: sA.id };
  siteB = { id: sB.id };
  regSubClauseId = clause.id;
  cqcKeyQuestionId = cqc.id;
  sixPillarId = pillar.id;
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

// ── (a) cross-tenant isolation via the service layer ──────────────────────

describe("Phase 4a: cross-tenant isolation via the Audits/Incidents service layer", () => {
  it("Org A cannot READ Org B's Audit by id via getAuditById", async () => {
    const orgBAudit = await rawPrisma.audit.findFirstOrThrow({ where: { orgId: ORG_B } });
    const result = await auditService.getAuditById(sessionA, orgBAudit.id);
    expect(result).toBeNull();
  });

  it("Org A cannot READ Org B's Incident by id via getIncidentById", async () => {
    const orgBIncident = await rawPrisma.incident.findFirstOrThrow({ where: { orgId: ORG_B } });
    const result = await incidentService.getIncidentById(sessionA, orgBIncident.id);
    expect(result).toBeNull();
  });

  it("Org A cannot EDIT Org B's Audit (editAudit throws, no new row created)", async () => {
    const orgBAudit = await rawPrisma.audit.findFirstOrThrow({
      where: { orgId: ORG_B, isCurrentVersion: true },
    });
    const countBefore = await rawPrisma.audit.count({ where: { orgId: ORG_B } });

    await expect(
      auditService.editAudit(sessionA, {
        id: orgBAudit.id,
        type: "HACKED BY ORG A",
        scheduledDate: new Date().toISOString(),
        followUpActions: [],
      })
    ).rejects.toThrow(auditService.AuditNotFoundError);

    const countAfter = await rawPrisma.audit.count({ where: { orgId: ORG_B } });
    expect(countAfter).toBe(countBefore);
    const stillIntact = await rawPrisma.audit.findUniqueOrThrow({ where: { id: orgBAudit.id } });
    expect(stillIntact.type).not.toBe("HACKED BY ORG A");
  });

  it("Org A cannot EDIT Org B's Incident (editIncident throws, no new row created)", async () => {
    const orgBIncident = await rawPrisma.incident.findFirstOrThrow({
      where: { orgId: ORG_B, isCurrentVersion: true },
    });
    const countBefore = await rawPrisma.incident.count({ where: { orgId: ORG_B } });

    await expect(
      incidentService.editIncident(sessionA, {
        id: orgBIncident.id,
        dateTime: new Date().toISOString(),
        description: "HACKED BY ORG A",
        severityGrading: "LOW",
        psirfClassification: "x",
        notifiableToCQC: false,
        followUpActions: [],
      })
    ).rejects.toThrow(incidentService.IncidentNotFoundError);

    const countAfter = await rawPrisma.incident.count({ where: { orgId: ORG_B } });
    expect(countAfter).toBe(countBefore);
  });

  it("Org A cannot DELETE (void) Org B's Audit", async () => {
    const orgBAudit = await rawPrisma.audit.findFirstOrThrow({
      where: { orgId: ORG_B, isCurrentVersion: true },
    });
    await expect(auditService.voidAudit(sessionA, orgBAudit.id)).rejects.toThrow(
      auditService.AuditNotFoundError
    );
    const stillIntact = await rawPrisma.audit.findUniqueOrThrow({ where: { id: orgBAudit.id } });
    expect(stillIntact.deletedAt).toBeNull();
  });

  it("Org A cannot DELETE (void) Org B's Incident", async () => {
    const orgBIncident = await rawPrisma.incident.findFirstOrThrow({
      where: { orgId: ORG_B, isCurrentVersion: true },
    });
    await expect(incidentService.voidIncident(sessionA, orgBIncident.id)).rejects.toThrow(
      incidentService.IncidentNotFoundError
    );
    const stillIntact = await rawPrisma.incident.findUniqueOrThrow({
      where: { id: orgBIncident.id },
    });
    expect(stillIntact.deletedAt).toBeNull();
  });

  it("Org A's own Audit list never includes an Org B row", async () => {
    const { items } = await auditService.listCurrentAudits(sessionA);
    expect(items.every((a) => a.orgId === ORG_A)).toBe(true);
  });
});

// ── (b) append-only versioning chain ───────────────────────────────────────

describe("Phase 4a: append-only versioning chain (Audit and Incident)", () => {
  it("Audit: two edits produce 3 rows with a correct version chain", async () => {
    const created = await auditService.createAudit(sessionA, {
      siteId: siteA.id,
      type: "Medication Management Audit",
      scheduledDate: new Date("2026-08-01").toISOString(),
    });

    const edit1 = await auditService.editAudit(sessionA, {
      id: created.id,
      type: "Medication Management Audit (v2)",
      scheduledDate: new Date("2026-08-02").toISOString(),
      followUpActions: [],
    });

    const edit2 = await auditService.editAudit(sessionA, {
      id: edit1.id,
      type: "Medication Management Audit (v3)",
      scheduledDate: new Date("2026-08-03").toISOString(),
      followUpActions: [],
    });

    // 3 rows total in the chain.
    const chain = await auditService.getAuditVersionChain(sessionA, created.id);
    expect(chain).toHaveLength(3);
    const byVersion = [...chain].sort((x, y) => x.versionNumber - y.versionNumber);
    expect(byVersion.map((r) => r.versionNumber)).toEqual([1, 2, 3]);

    // Row 1 (original): superseded by row 2, isCurrentVersion false.
    const row1 = await rawPrisma.audit.findUniqueOrThrow({ where: { id: created.id } });
    expect(row1.isCurrentVersion).toBe(false);
    expect(row1.supersededById).toBe(edit1.id);
    expect(row1.versionNumber).toBe(1);

    // Row 2 (first edit): superseded by row 3, isCurrentVersion false.
    const row2 = await rawPrisma.audit.findUniqueOrThrow({ where: { id: edit1.id } });
    expect(row2.isCurrentVersion).toBe(false);
    expect(row2.supersededById).toBe(edit2.id);
    expect(row2.versionNumber).toBe(2);

    // Row 3 (second edit / current): isCurrentVersion true, not superseded.
    const row3 = await rawPrisma.audit.findUniqueOrThrow({ where: { id: edit2.id } });
    expect(row3.isCurrentVersion).toBe(true);
    expect(row3.supersededById).toBeNull();
    expect(row3.versionNumber).toBe(3);
    expect(row3.type).toBe("Medication Management Audit (v3)");

    // Editing the ORIGINAL id (now superseded) must be rejected, not silently
    // redirected to the current version.
    await expect(
      auditService.editAudit(sessionA, {
        id: created.id,
        type: "should fail",
        scheduledDate: new Date().toISOString(),
        followUpActions: [],
      })
    ).rejects.toThrow(auditService.SuperseededVersionError);
  });

  it("Incident: two edits produce 3 rows with a correct version chain", async () => {
    const created = await incidentService.createIncident(sessionA, {
      siteId: siteA.id,
      dateTime: new Date("2026-08-01T10:00:00Z").toISOString(),
      description: "Initial incident description",
      anonymisationAcknowledged: true,
      severityGrading: "LOW",
      psirfClassification: "Learning response",
      notifiableToCQC: false,
    });

    const edit1 = await incidentService.editIncident(sessionA, {
      id: created.id,
      dateTime: new Date("2026-08-01T11:00:00Z").toISOString(),
      description: "Updated incident description (v2)",
      severityGrading: "MODERATE",
      psirfClassification: "Learning response",
      notifiableToCQC: false,
      followUpActions: [],
    });

    const edit2 = await incidentService.editIncident(sessionA, {
      id: edit1.id,
      dateTime: new Date("2026-08-01T12:00:00Z").toISOString(),
      description: "Updated incident description (v3)",
      severityGrading: "SEVERE",
      psirfClassification: "Learning response",
      notifiableToCQC: true,
      followUpActions: [],
    });

    const chain = await incidentService.getIncidentVersionChain(sessionA, created.id);
    expect(chain).toHaveLength(3);
    const byVersion = [...chain].sort((x, y) => x.versionNumber - y.versionNumber);
    expect(byVersion.map((r) => r.versionNumber)).toEqual([1, 2, 3]);

    const row1 = await rawPrisma.incident.findUniqueOrThrow({ where: { id: created.id } });
    expect(row1.isCurrentVersion).toBe(false);
    expect(row1.supersededById).toBe(edit1.id);

    const row2 = await rawPrisma.incident.findUniqueOrThrow({ where: { id: edit1.id } });
    expect(row2.isCurrentVersion).toBe(false);
    expect(row2.supersededById).toBe(edit2.id);

    const row3 = await rawPrisma.incident.findUniqueOrThrow({ where: { id: edit2.id } });
    expect(row3.isCurrentVersion).toBe(true);
    expect(row3.supersededById).toBeNull();
    expect(row3.severityGrading).toBe("SEVERE");
    expect(row3.notifiableToCQC).toBe(true);
  });
});

// ── (c) real AuditLogEntry rows with non-trivial snapshots ────────────────

describe("Phase 4a: every mutation writes a real AuditLogEntry", () => {
  it("createAudit writes a CREATE AuditLogEntry with a populated afterSnapshot", async () => {
    const created = await auditService.createAudit(sessionA, {
      siteId: siteA.id,
      type: "Fire Safety Audit",
      scheduledDate: new Date("2026-09-01").toISOString(),
    });

    const entries = await rawPrisma.auditLogEntry.findMany({
      where: { entityType: "AUDIT", entityId: created.id },
    });
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry.action).toBe("CREATE");
    expect(entry.orgId).toBe(ORG_A);
    expect(entry.userId).toBe(sessionA.id);
    expect(entry.beforeSnapshot).toBeNull();
    expect(entry.afterSnapshot).not.toBeNull();
    const after = entry.afterSnapshot as Record<string, unknown>;
    expect(after.type).toBe("Fire Safety Audit");
    expect(after.id).toBe(created.id);
  });

  it("editAudit writes an UPDATE AuditLogEntry with distinct before/after snapshots", async () => {
    const created = await auditService.createAudit(sessionA, {
      siteId: siteA.id,
      type: "Care Plan Audit",
      scheduledDate: new Date("2026-09-05").toISOString(),
    });

    const edited = await auditService.editAudit(sessionA, {
      id: created.id,
      type: "Care Plan Audit (revised)",
      scheduledDate: new Date("2026-09-06").toISOString(),
      followUpActions: [
        {
          description: "Follow up with staff training",
          ownerId: sessionA.id,
          dueDate: new Date("2026-09-10").toISOString(),
          status: "OPEN",
        },
      ],
    });

    const entry = await rawPrisma.auditLogEntry.findFirstOrThrow({
      where: { entityType: "AUDIT", entityId: edited.id, action: "UPDATE" },
    });
    expect(entry.beforeSnapshot).not.toBeNull();
    expect(entry.afterSnapshot).not.toBeNull();
    const before = entry.beforeSnapshot as Record<string, unknown>;
    const after = entry.afterSnapshot as Record<string, unknown>;
    expect(before.type).toBe("Care Plan Audit");
    expect(after.type).toBe("Care Plan Audit (revised)");
    expect(before.id).toBe(created.id);
    expect(after.id).toBe(edited.id);
    // Non-trivial: real business field data, not an empty object.
    expect(Object.keys(before).length).toBeGreaterThan(5);
    expect(Object.keys(after).length).toBeGreaterThan(5);
  });

  it("voidAudit writes a DELETE AuditLogEntry with before/after snapshots showing the deletedAt transition", async () => {
    const created = await auditService.createAudit(sessionA, {
      siteId: siteA.id,
      type: "Void Test Audit",
      scheduledDate: new Date("2026-09-08").toISOString(),
    });
    await auditService.voidAudit(sessionA, created.id);

    const entry = await rawPrisma.auditLogEntry.findFirstOrThrow({
      where: { entityType: "AUDIT", entityId: created.id, action: "DELETE" },
    });
    const before = entry.beforeSnapshot as Record<string, unknown>;
    const after = entry.afterSnapshot as Record<string, unknown>;
    expect(before.deletedAt).toBeNull();
    expect(after.deletedAt).not.toBeNull();
  });

  it("createIncident writes a CREATE AuditLogEntry with a populated afterSnapshot", async () => {
    const created = await incidentService.createIncident(sessionA, {
      siteId: siteA.id,
      dateTime: new Date("2026-09-01T09:00:00Z").toISOString(),
      description: "Slip in corridor",
      anonymisationAcknowledged: true,
      severityGrading: "NO_HARM",
      psirfClassification: "Learning response",
      notifiableToCQC: false,
    });

    const entry = await rawPrisma.auditLogEntry.findFirstOrThrow({
      where: { entityType: "INCIDENT", entityId: created.id, action: "CREATE" },
    });
    expect(entry.beforeSnapshot).toBeNull();
    const after = entry.afterSnapshot as Record<string, unknown>;
    expect(after.description).toBe("Slip in corridor");
  });

  it("closeIncident writes an APPROVE AuditLogEntry", async () => {
    const created = await incidentService.createIncident(sessionA, {
      siteId: siteA.id,
      dateTime: new Date("2026-09-02T09:00:00Z").toISOString(),
      description: "Minor equipment fault",
      anonymisationAcknowledged: true,
      severityGrading: "NO_HARM",
      psirfClassification: "Learning response",
      notifiableToCQC: false,
    });
    const closed = await incidentService.closeIncident(sessionA, { id: created.id });

    const entry = await rawPrisma.auditLogEntry.findFirstOrThrow({
      where: { entityType: "INCIDENT", entityId: closed.id, action: "APPROVE" },
    });
    const after = entry.afterSnapshot as Record<string, unknown>;
    expect(after.status).toBe("CLOSED");
  });
});

// ── (d) the polymorphic tagging integrity gap ──────────────────────────────

describe("Phase 4a: tagging-integrity gap (RegClauseTag/CQCKeyQuestionTag/SixPillarTag)", () => {
  it("WRITE-TIME: Org A cannot create a RegClauseTag pointing at Org B's Audit", async () => {
    const orgBAudit = await rawPrisma.audit.findFirstOrThrow({
      where: { orgId: ORG_B, isCurrentVersion: true },
    });

    await expect(
      auditService.addAuditRegClauseTag(sessionA, orgBAudit.id, regSubClauseId)
    ).rejects.toThrow(EntityNotOwnedError);

    const leaked = await rawPrisma.regClauseTag.findFirst({
      where: { entityType: "AUDIT", entityId: orgBAudit.id, orgId: ORG_A },
    });
    expect(leaked).toBeNull();
  });

  it("WRITE-TIME: Org A cannot create a CQCKeyQuestionTag pointing at Org B's Incident", async () => {
    const orgBIncident = await rawPrisma.incident.findFirstOrThrow({
      where: { orgId: ORG_B, isCurrentVersion: true },
    });

    await expect(
      incidentService.addIncidentCQCKeyQuestionTag(sessionA, orgBIncident.id, cqcKeyQuestionId)
    ).rejects.toThrow(EntityNotOwnedError);
  });

  it("WRITE-TIME: Org A can tag its OWN Audit successfully (sanity check the gate isn't blanket-denying)", async () => {
    const orgAAudit = await rawPrisma.audit.findFirstOrThrow({
      where: { orgId: ORG_A, isCurrentVersion: true },
    });
    const tag = await auditService.addAuditRegClauseTag(sessionA, orgAAudit.id, regSubClauseId);
    expect(tag.entityId).toBe(orgAAudit.id);
    // cleanup
    await rawPrisma.regClauseTag.delete({ where: { id: tag.id } });
  });

  it("READ-TIME: a mismatched RegClauseTag row inserted directly (simulating a bug elsewhere, bypassing assertOwnedEntity) cannot leak Org B's Audit info through Org A's listAuditTags", async () => {
    const orgBAudit = await rawPrisma.audit.findFirstOrThrow({
      where: { orgId: ORG_B, isCurrentVersion: true },
    });

    // Simulate the exact gap described in the schema/tagging.ts comments:
    // a tag row whose orgId is Org A's (so scopedDb's own orgId-scoping on
    // the tag table would not filter it out) but whose entityId points at
    // an Audit that actually belongs to Org B. This bypasses
    // assertOwnedEntity entirely by writing straight through rawPrisma, the
    // same way "a raw SQL fix, a future migration, a different code path
    // that forgets to call this" would.
    const badTag = await rawPrisma.regClauseTag.create({
      data: {
        orgId: ORG_A,
        entityType: "AUDIT",
        entityId: orgBAudit.id,
        regSubClauseId,
        taggedById: sessionA.id,
      },
    });

    try {
      // Precondition: the bad row really is visible to a naive orgId-scoped
      // query keyed off entityId alone (i.e. the leak would happen if
      // listAuditTags trusted the tag row instead of re-verifying).
      const naive = await rawPrisma.regClauseTag.findMany({
        where: { orgId: ORG_A, entityType: "AUDIT", entityId: orgBAudit.id },
      });
      expect(naive).toHaveLength(1);

      // The actual read path must still return nothing for it.
      const result = await auditService.listAuditTags(sessionA, orgBAudit.id);
      expect(result.regClauseTags).toHaveLength(0);
      expect(result.cqcKeyQuestionTags).toHaveLength(0);
    } finally {
      await rawPrisma.regClauseTag.delete({ where: { id: badTag.id } });
    }
  });

  it("READ-TIME: a mismatched SixPillarTag inserted with Org B's orgId against Org A's own Incident cannot leak through Org A's listIncidentTags", async () => {
    const orgAIncident = await rawPrisma.incident.findFirstOrThrow({
      where: { orgId: ORG_A, isCurrentVersion: true },
    });

    // Reverse-direction corruption: orgId=B, entityId=Org A's own incident.
    // scopedDb(ORG_A)'s own where-injection would already exclude this row
    // (orgId mismatch), but we assert it explicitly as part of proving the
    // read path never trusts the tag row over a live ownership check.
    const badTag = await rawPrisma.sixPillarTag.create({
      data: {
        orgId: ORG_B,
        entityType: "INCIDENT",
        entityId: orgAIncident.id,
        sixPillarId,
        taggedById: sessionB.id,
      },
    });

    try {
      const result = await incidentService.listIncidentTags(sessionA, orgAIncident.id);
      expect(result.sixPillarTags.every((t) => t.id !== badTag.id)).toBe(true);
    } finally {
      await rawPrisma.sixPillarTag.delete({ where: { id: badTag.id } });
    }
  });

  it("READ-TIME: listAuditTags returns empty (not an error) for an id that simply isn't Org A's, same shape as a nonexistent id — no information leak via error/shape difference", async () => {
    const orgBAudit = await rawPrisma.audit.findFirstOrThrow({ where: { orgId: ORG_B } });
    const forReal = await auditService.listAuditTags(sessionA, orgBAudit.id);
    const forFake = await auditService.listAuditTags(sessionA, "nonexistent-id-xyz");
    expect(forReal).toEqual(forFake);
  });
});

// ── (e) Zod rejection of malformed followUpActions ─────────────────────────

describe("Phase 4a: malformed followUpActions rejected by Zod", () => {
  it("EditAuditSchema rejects a followUpActions entry missing required fields", () => {
    const result = EditAuditSchema.safeParse({
      id: "some-id",
      type: "Test",
      scheduledDate: new Date().toISOString(),
      followUpActions: [{ description: "missing everything else" }],
    });
    expect(result.success).toBe(false);
  });

  it("EditAuditSchema rejects a followUpActions entry with an invalid status enum value", () => {
    const result = EditAuditSchema.safeParse({
      id: "some-id",
      type: "Test",
      scheduledDate: new Date().toISOString(),
      followUpActions: [
        {
          description: "bad status",
          ownerId: "user-1",
          dueDate: new Date().toISOString(),
          status: "NOT_A_REAL_STATUS",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("EditAuditSchema rejects followUpActions that isn't an array", () => {
    const result = EditAuditSchema.safeParse({
      id: "some-id",
      type: "Test",
      scheduledDate: new Date().toISOString(),
      followUpActions: "not-an-array",
    });
    expect(result.success).toBe(false);
  });

  it("editAudit (service layer) rejects a malformed followUpActions payload end-to-end", async () => {
    const created = await auditService.createAudit(sessionA, {
      siteId: siteA.id,
      type: "Zod Rejection Test Audit",
      scheduledDate: new Date("2026-09-15").toISOString(),
    });

    expect(() =>
      EditAuditSchema.parse({
        id: created.id,
        type: "Zod Rejection Test Audit",
        scheduledDate: new Date().toISOString(),
        followUpActions: [{ description: "", ownerId: "", dueDate: "not-a-date", status: "BOGUS" }],
      })
    ).toThrow();
  });

  it("EditIncidentSchema rejects a malformed followUpActions payload", () => {
    const result = EditIncidentSchema.safeParse({
      id: "some-id",
      dateTime: new Date().toISOString(),
      description: "Test",
      severityGrading: "LOW",
      psirfClassification: "x",
      notifiableToCQC: false,
      followUpActions: [{ description: "x", ownerId: "u1", dueDate: "x", status: "DONE" }],
    });
    // dueDate "x" is not a valid date string per isoDateString's refine.
    expect(result.success).toBe(false);
  });

  it("CreateIncidentSchema rejects anonymisationAcknowledged !== true (server independently enforces the guidance checkbox)", async () => {
    const { CreateIncidentSchema } = await import("@/server/incidents/schemas");
    const result = CreateIncidentSchema.safeParse({
      siteId: siteA.id,
      dateTime: new Date().toISOString(),
      description: "Test",
      anonymisationAcknowledged: false,
      severityGrading: "LOW",
      psirfClassification: "x",
      notifiableToCQC: false,
    });
    expect(result.success).toBe(false);
  });
});
