import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { rawPrisma } from "@/server/db/prisma";
import { scopedDb } from "@/server/db/scoped-client";
import type { SessionUser } from "@/server/auth/session";
import {
  computeRiskRating,
  createRiskEntry,
  editRiskEntry,
  getRiskEntryVersionChain,
  RiskEntryNotFoundError,
} from "@/server/risks/service";
import {
  createPolicy,
  editPolicy,
  getPolicyVersionChain,
  PolicyNotFoundError,
} from "@/server/policies/service";
import { createTag, getTagsForEntity, TaggedEntityNotFoundError } from "@/server/domain/tag-integrity";

// This suite runs against a real, migrated, seeded Postgres database
// (DATABASE_URL should point at bncl_test_phase4b) — the Risk
// Register/Policies analogue of tests/tenant-isolation.test.ts. It covers
// exactly the six highest-risk acceptance criteria from
// BUILD_CHECKLIST.md Phase 4 for this module pair:
//   (a) cross-tenant isolation on RiskEntry/Policy
//   (b) the append-only versioning chain after two edits
//   (c) every create/edit writes a real AuditLogEntry with non-trivial snapshots
//   (d) the polymorphic tag entityId/orgId integrity gap, write-side AND read-side
//   (e) riskRating is always server-computed, never trusted from client input
//   (f) malformed mitigationActions rejected by Zod at the write boundary

const ORG_A = "demo-org-a";
const ORG_B = "demo-org-b";

let sessionA: SessionUser;
let sessionB: SessionUser;
let siteA: string;
let siteB: string;

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

function riskInput(overrides: Record<string, unknown> = {}) {
  return {
    siteId: siteA,
    title: `Test risk ${Math.random().toString(36).slice(2)}`,
    description: "Seeded-for-test risk description.",
    likelihood: 2,
    impact: 3,
    ownerId: sessionA.id,
    mitigationActions: [],
    reviewDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    status: "OPEN",
    ...overrides,
  };
}

function policyInput(overrides: Record<string, unknown> = {}) {
  return {
    siteId: siteA,
    title: `Test policy ${Math.random().toString(36).slice(2)}`,
    reviewDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    status: "ACTIVE",
    ...overrides,
  };
}

describe("Phase 4b (a): cross-tenant isolation — RiskEntry & Policy", () => {
  it("Org A cannot READ Org B's RiskEntry via scopedDb", async () => {
    const orgBRisk = await rawPrisma.riskEntry.findFirstOrThrow({ where: { orgId: ORG_B } });
    const result = await scopedDb(ORG_A).riskEntry.findUnique({ where: { id: orgBRisk.id } });
    expect(result).toBeNull();
  });

  it("Org A cannot EDIT Org B's RiskEntry via raw scopedDb.update (rejected, row untouched)", async () => {
    const orgBRisk = await rawPrisma.riskEntry.findFirstOrThrow({ where: { orgId: ORG_B } });
    await expect(
      scopedDb(ORG_A).riskEntry.update({ where: { id: orgBRisk.id }, data: { title: "HACKED BY ORG A" } })
    ).rejects.toThrow();
    const stillIntact = await rawPrisma.riskEntry.findUniqueOrThrow({ where: { id: orgBRisk.id } });
    expect(stillIntact.title).toBe(orgBRisk.title);
  });

  it("Org A cannot DELETE Org B's RiskEntry via raw scopedDb.delete (rejected, row still exists)", async () => {
    const orgBRisk = await rawPrisma.riskEntry.findFirstOrThrow({ where: { orgId: ORG_B } });
    await expect(scopedDb(ORG_A).riskEntry.delete({ where: { id: orgBRisk.id } })).rejects.toThrow();
    const stillExists = await rawPrisma.riskEntry.findUnique({ where: { id: orgBRisk.id } });
    expect(stillExists).not.toBeNull();
  });

  it("service-level: editRiskEntry rejects when Org A targets Org B's RiskEntry id", async () => {
    const orgBRisk = await rawPrisma.riskEntry.findFirstOrThrow({ where: { orgId: ORG_B } });
    await expect(editRiskEntry(sessionA, orgBRisk.id, riskInput())).rejects.toThrow(
      RiskEntryNotFoundError
    );
  });

  it("Org A cannot READ Org B's Policy via scopedDb", async () => {
    const orgBPolicy = await rawPrisma.policy.findFirstOrThrow({ where: { orgId: ORG_B } });
    const result = await scopedDb(ORG_A).policy.findUnique({ where: { id: orgBPolicy.id } });
    expect(result).toBeNull();
  });

  it("Org A cannot EDIT Org B's Policy via raw scopedDb.update (rejected, row untouched)", async () => {
    const orgBPolicy = await rawPrisma.policy.findFirstOrThrow({ where: { orgId: ORG_B } });
    await expect(
      scopedDb(ORG_A).policy.update({ where: { id: orgBPolicy.id }, data: { title: "HACKED BY ORG A" } })
    ).rejects.toThrow();
    const stillIntact = await rawPrisma.policy.findUniqueOrThrow({ where: { id: orgBPolicy.id } });
    expect(stillIntact.title).toBe(orgBPolicy.title);
  });

  it("Org A cannot DELETE Org B's Policy via raw scopedDb.delete (rejected, row still exists)", async () => {
    const orgBPolicy = await rawPrisma.policy.findFirstOrThrow({ where: { orgId: ORG_B } });
    await expect(scopedDb(ORG_A).policy.delete({ where: { id: orgBPolicy.id } })).rejects.toThrow();
    const stillExists = await rawPrisma.policy.findUnique({ where: { id: orgBPolicy.id } });
    expect(stillExists).not.toBeNull();
  });

  it("service-level: editPolicy rejects when Org A targets Org B's Policy id", async () => {
    const orgBPolicy = await rawPrisma.policy.findFirstOrThrow({ where: { orgId: ORG_B } });
    await expect(editPolicy(sessionA, orgBPolicy.id, policyInput())).rejects.toThrow(PolicyNotFoundError);
  });

  it("symmetric spot-check: Org B cannot read Org A's RiskEntry", async () => {
    const orgARisk = await rawPrisma.riskEntry.findFirstOrThrow({ where: { orgId: ORG_A } });
    const result = await scopedDb(ORG_B).riskEntry.findUnique({ where: { id: orgARisk.id } });
    expect(result).toBeNull();
  });

  it("symmetric spot-check: Org B (as an authenticated session) cannot editPolicy on Org A's Policy", async () => {
    const orgAPolicy = await rawPrisma.policy.findFirstOrThrow({ where: { orgId: ORG_A } });
    await expect(editPolicy(sessionB, orgAPolicy.id, policyInput({ siteId: siteB }))).rejects.toThrow(
      PolicyNotFoundError
    );
  });
});

describe("Phase 4b (b): append-only versioning chain", () => {
  it("RiskEntry: two edits produce three real rows with a correct version chain", async () => {
    const v1 = await createRiskEntry(sessionA, riskInput({ title: "Chain risk v1" }));
    const v2 = await editRiskEntry(
      sessionA,
      v1.id,
      riskInput({ title: "Chain risk v2", likelihood: 3, impact: 3 })
    );
    const v3 = await editRiskEntry(
      sessionA,
      v2.id,
      riskInput({ title: "Chain risk v3", likelihood: 4, impact: 5 })
    );

    const rows = await rawPrisma.riskEntry.findMany({ where: { id: { in: [v1.id, v2.id, v3.id] } } });
    expect(rows).toHaveLength(3);

    const row1 = rows.find((r) => r.id === v1.id)!;
    const row2 = rows.find((r) => r.id === v2.id)!;
    const row3 = rows.find((r) => r.id === v3.id)!;

    expect(row1.versionNumber).toBe(1);
    expect(row1.isCurrentVersion).toBe(false);
    expect(row1.supersededById).toBe(v2.id);

    expect(row2.versionNumber).toBe(2);
    expect(row2.isCurrentVersion).toBe(false);
    expect(row2.supersededById).toBe(v3.id);

    expect(row3.versionNumber).toBe(3);
    expect(row3.isCurrentVersion).toBe(true);
    expect(row3.supersededById).toBeNull();

    const chain = await getRiskEntryVersionChain(ORG_A, v3.id);
    expect(chain?.map((r) => r.id)).toEqual([v3.id, v2.id, v1.id]);
    expect(chain?.map((r) => r.versionNumber)).toEqual([3, 2, 1]);
  });

  it("Policy: two edits produce three real rows with a correct version chain", async () => {
    const v1 = await createPolicy(sessionA, policyInput({ title: "Chain policy v1" }));
    const v2 = await editPolicy(sessionA, v1.id, policyInput({ title: "Chain policy v2", status: "UNDER_REVIEW" }));
    const v3 = await editPolicy(sessionA, v2.id, policyInput({ title: "Chain policy v3", status: "ACTIVE" }));

    const rows = await rawPrisma.policy.findMany({ where: { id: { in: [v1.id, v2.id, v3.id] } } });
    expect(rows).toHaveLength(3);

    const row1 = rows.find((r) => r.id === v1.id)!;
    const row2 = rows.find((r) => r.id === v2.id)!;
    const row3 = rows.find((r) => r.id === v3.id)!;

    expect(row1.versionNumber).toBe(1);
    expect(row1.isCurrentVersion).toBe(false);
    expect(row1.supersededById).toBe(v2.id);

    expect(row2.versionNumber).toBe(2);
    expect(row2.isCurrentVersion).toBe(false);
    expect(row2.supersededById).toBe(v3.id);

    expect(row3.versionNumber).toBe(3);
    expect(row3.isCurrentVersion).toBe(true);
    expect(row3.supersededById).toBeNull();

    const chain = await getPolicyVersionChain(ORG_A, v3.id);
    expect(chain?.map((r) => r.id)).toEqual([v3.id, v2.id, v1.id]);
  });
});

describe("Phase 4b (c): AuditLogEntry written on every mutation, with real snapshots", () => {
  it("createRiskEntry + editRiskEntry write real AuditLogEntry rows with non-trivial before/after JSON", async () => {
    const created = await createRiskEntry(sessionA, riskInput({ title: "Audit risk", likelihood: 1, impact: 2 }));
    const edited = await editRiskEntry(
      sessionA,
      created.id,
      riskInput({ title: "Audit risk edited", likelihood: 5, impact: 5 })
    );

    const createLog = await rawPrisma.auditLogEntry.findFirst({
      where: { entityType: "RISK_ENTRY", entityId: created.id, action: "CREATE" },
    });
    expect(createLog).not.toBeNull();
    expect(createLog!.beforeSnapshot).toBeNull();
    expect((createLog!.afterSnapshot as Record<string, unknown>).title).toBe("Audit risk");
    expect((createLog!.afterSnapshot as Record<string, unknown>).riskRating).toBe(2);

    const updateLog = await rawPrisma.auditLogEntry.findFirst({
      where: { entityType: "RISK_ENTRY", entityId: edited.id, action: "UPDATE" },
    });
    expect(updateLog).not.toBeNull();
    expect((updateLog!.beforeSnapshot as Record<string, unknown>).title).toBe("Audit risk");
    expect((updateLog!.afterSnapshot as Record<string, unknown>).title).toBe("Audit risk edited");
    expect((updateLog!.afterSnapshot as Record<string, unknown>).riskRating).toBe(25);
  });

  it("createPolicy + editPolicy write real AuditLogEntry rows with non-trivial before/after JSON", async () => {
    const created = await createPolicy(sessionA, policyInput({ title: "Audit policy" }));
    const edited = await editPolicy(sessionA, created.id, policyInput({ title: "Audit policy edited" }));

    const createLog = await rawPrisma.auditLogEntry.findFirst({
      where: { entityType: "POLICY", entityId: created.id, action: "CREATE" },
    });
    expect(createLog).not.toBeNull();
    expect(createLog!.beforeSnapshot).toBeNull();
    expect((createLog!.afterSnapshot as Record<string, unknown>).title).toBe("Audit policy");

    const updateLog = await rawPrisma.auditLogEntry.findFirst({
      where: { entityType: "POLICY", entityId: edited.id, action: "UPDATE" },
    });
    expect(updateLog).not.toBeNull();
    expect((updateLog!.beforeSnapshot as Record<string, unknown>).title).toBe("Audit policy");
    expect((updateLog!.afterSnapshot as Record<string, unknown>).title).toBe("Audit policy edited");
  });
});

describe("Phase 4b (d): polymorphic tag entityId/orgId integrity gap", () => {
  it("Org A cannot create a tag pointing entityId at Org B's RiskEntry (write-side guard)", async () => {
    const orgBRisk = await rawPrisma.riskEntry.findFirstOrThrow({ where: { orgId: ORG_B } });
    const regClause = await rawPrisma.regulatorySubClause.findFirstOrThrow();

    await expect(
      createTag(sessionA, {
        entityType: "RISK_ENTRY",
        entityId: orgBRisk.id,
        taxonomy: "REG_CLAUSE",
        taxonomyId: regClause.id,
      })
    ).rejects.toThrow(TaggedEntityNotFoundError);

    const leaked = await rawPrisma.regClauseTag.findFirst({ where: { orgId: ORG_A, entityId: orgBRisk.id } });
    expect(leaked).toBeNull();
  });

  it("Org A cannot create a tag pointing entityId at Org B's Policy (write-side guard)", async () => {
    const orgBPolicy = await rawPrisma.policy.findFirstOrThrow({ where: { orgId: ORG_B } });
    const sixPillar = await rawPrisma.sixPillar.findFirstOrThrow();

    await expect(
      createTag(sessionA, {
        entityType: "POLICY",
        entityId: orgBPolicy.id,
        taxonomy: "SIX_PILLAR",
        taxonomyId: sixPillar.id,
      })
    ).rejects.toThrow(TaggedEntityNotFoundError);

    const leaked = await rawPrisma.sixPillarTag.findFirst({ where: { orgId: ORG_A, entityId: orgBPolicy.id } });
    expect(leaked).toBeNull();
  });

  it("a directly-inserted mismatched tag (own orgId, foreign entityId) cannot leak content through the read-side query", async () => {
    const orgBRisk = await rawPrisma.riskEntry.findFirstOrThrow({ where: { orgId: ORG_B } });
    const regClause = await rawPrisma.regulatorySubClause.findFirstOrThrow();

    // Bypass createTag()'s write-side guard entirely via rawPrisma — this
    // simulates the exact scenario the schema header comment warns about:
    // a tag row whose OWN orgId is correct (ORG_A) but whose entityId
    // points at a RiskEntry belonging to a different org (ORG_B).
    const badTag = await rawPrisma.regClauseTag.create({
      data: {
        orgId: ORG_A,
        entityType: "RISK_ENTRY",
        entityId: orgBRisk.id,
        regSubClauseId: regClause.id,
        taggedById: sessionA.id,
      },
    });

    try {
      // scopedDb(ORG_A).regClauseTag.findMany({ where: { entityId } }) WOULD
      // return this row (its own orgId matches) — the read-side double
      // check in getTagsForEntity must still refuse to surface it because
      // the referenced RiskEntry itself does not belong to ORG_A.
      const rawScopedResult = await scopedDb(ORG_A).regClauseTag.findMany({
        where: { entityType: "RISK_ENTRY", entityId: orgBRisk.id },
      });
      expect(rawScopedResult.length).toBeGreaterThan(0); // sanity: the leak really is there at the raw-tag level

      const tags = await getTagsForEntity(ORG_A, "RISK_ENTRY", orgBRisk.id);
      expect(tags.regClauseTags).toHaveLength(0);
      expect(tags.cqcKeyQuestionTags).toHaveLength(0);
      expect(tags.sixPillarTags).toHaveLength(0);
    } finally {
      await rawPrisma.regClauseTag.delete({ where: { id: badTag.id } });
    }
  });

  it("sanity: a legitimately-tagged Org A RiskEntry DOES surface via getTagsForEntity", async () => {
    const risk = await createRiskEntry(sessionA, riskInput({ title: "Tag sanity risk" }));
    const regClause = await rawPrisma.regulatorySubClause.findFirstOrThrow();
    await createTag(sessionA, {
      entityType: "RISK_ENTRY",
      entityId: risk.id,
      taxonomy: "REG_CLAUSE",
      taxonomyId: regClause.id,
    });
    const tags = await getTagsForEntity(ORG_A, "RISK_ENTRY", risk.id);
    expect(tags.regClauseTags).toHaveLength(1);
    expect(tags.regClauseTags[0]!.regSubClauseId).toBe(regClause.id);
  });
});

describe("Phase 4b (e): riskRating is always server-computed, never trusted from client input", () => {
  it("createRiskEntry ignores a spoofed client riskRating and computes likelihood * impact", async () => {
    const created = await createRiskEntry(sessionA, riskInput({ likelihood: 2, impact: 3, riskRating: 999 }));
    expect(created.riskRating).toBe(6);
    expect(created.riskRating).not.toBe(999);
  });

  it("editRiskEntry ignores a spoofed client riskRating on every subsequent edit too", async () => {
    const created = await createRiskEntry(sessionA, riskInput({ likelihood: 1, impact: 1, riskRating: 1 }));
    expect(created.riskRating).toBe(1);
    const edited = await editRiskEntry(
      sessionA,
      created.id,
      riskInput({ likelihood: 5, impact: 5, riskRating: 1 }) // spoofed to stay "1"
    );
    expect(edited.riskRating).toBe(25);
    expect(edited.riskRating).not.toBe(1);
  });

  it("computeRiskRating itself is the single source of truth (likelihood * impact)", () => {
    expect(computeRiskRating(4, 5)).toBe(20);
    expect(computeRiskRating(1, 1)).toBe(1);
    expect(computeRiskRating(5, 5)).toBe(25);
  });
});

describe("Phase 4b (f): mitigationActions validated by Zod at the write boundary", () => {
  it("rejects a mitigation action with missing/invalid fields and creates no RiskEntry row", async () => {
    const before = await rawPrisma.riskEntry.count({ where: { orgId: ORG_A } });
    await expect(
      createRiskEntry(
        sessionA,
        riskInput({
          mitigationActions: [{ description: "", ownerId: "", dueDate: "not-a-date", status: "BOGUS" }],
        })
      )
    ).rejects.toThrow();
    const after = await rawPrisma.riskEntry.count({ where: { orgId: ORG_A } });
    expect(after).toBe(before);
  });

  it("rejects a mitigation action carrying an unrecognized extra field (schema is .strict())", async () => {
    await expect(
      createRiskEntry(
        sessionA,
        riskInput({
          mitigationActions: [
            {
              description: "Valid-looking",
              ownerId: sessionA.id,
              dueDate: new Date().toISOString(),
              status: "OPEN",
              completedDate: null,
              notAField: "should cause rejection",
            },
          ],
        })
      )
    ).rejects.toThrow();
  });

  it("accepts a well-formed mitigation action", async () => {
    const created = await createRiskEntry(
      sessionA,
      riskInput({
        mitigationActions: [
          {
            description: "Valid action",
            ownerId: sessionA.id,
            dueDate: new Date().toISOString(),
            status: "OPEN",
            completedDate: null,
          },
        ],
      })
    );
    expect(created.id).toBeTruthy();
    expect((created.mitigationActions as unknown[]).length).toBe(1);
  });
});

