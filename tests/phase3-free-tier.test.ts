import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { rawPrisma } from "@/server/db/prisma";
import { scopedDb } from "@/server/db/scoped-client";
import type { SessionUser } from "@/server/auth/session";
import { requireTier, TierRequiredError } from "@/server/rbac/tier";
import { computeReadinessScore } from "@/server/readiness/scoring";
import { READINESS_QUESTIONS } from "@/server/readiness/questions";
import { listQGHubContentForViewer, getQGHubContentForViewer } from "@/server/content/qg-hub";
import {
  createQGHubContent,
  updateQGHubContent,
  BnclAdminRequiredError,
} from "@/server/bncl-admin/client";

// This suite runs against a real, migrated, seeded Postgres database
// (DATABASE_URL should point at bncl_test_phase3 — see BUILD_CHECKLIST.md
// Phase 3). It covers the four acceptance criteria required by
// BUILD_CHECKLIST.md Phase 3's verification section:
//   (a) Org A cannot read Org B's ReadinessScore rows/history via scopedDb.
//   (b) the readiness scoring function is pure and correct for known inputs.
//   (c) requireTier('PAID') rejects a FREE-tier org session and accepts a
//       PAID-tier one.
//   (d) a non-BNCL_ADMIN cannot write QGHubContent.
// It complements, and does not replace, tests/tenant-isolation.test.ts
// (which already covers Org A/B's Site/User/Audit/Incident isolation and
// must still pass — run both files together).

const ORG_A = "demo-org-a"; // seeded, PAID tier
const ORG_B = "demo-org-b"; // seeded, PAID tier
const FREE_ORG_ID = "phase3-test-free-org"; // created below, FREE tier

const ownerSessionA: SessionUser = {
  id: "phase3-test-owner-a",
  orgId: ORG_A,
  role: "OWNER",
  email: "owner@greenfield-demo.example",
};

const ownerSessionB: SessionUser = {
  id: "phase3-test-owner-b",
  orgId: ORG_B,
  role: "OWNER",
  email: "owner@riverside-demo.example",
};

const bnclAdminSession: SessionUser = {
  id: "phase3-test-admin",
  orgId: "bncl-internal-org",
  role: "BNCL_ADMIN",
  email: "admin@bncl-solutions.example",
};

let freeOrgSession: SessionUser;
let readinessScoreIdA: string;
let readinessScoreIdB: string;
let draftContentId: string;
let publishedContentId: string;
let createdContentIds: string[] = [];

beforeAll(async () => {
  // A FREE-tier org isn't part of the base seed (prisma/seed.ts's two demo
  // orgs are both PAID) — Phase 3 needs one to prove requireTier() actually
  // rejects FREE. Created directly via rawPrisma, following the pattern
  // prisma/seed.ts itself uses for org creation.
  const freeOrg = await rawPrisma.organisation.upsert({
    where: { id: FREE_ORG_ID },
    update: { subscriptionTier: "FREE" },
    create: {
      id: FREE_ORG_ID,
      name: "Phase 3 Test Free-Tier Org",
      subscriptionTier: "FREE",
      billingStatus: "TRIALING",
    },
  });
  freeOrgSession = {
    id: "phase3-test-free-owner",
    orgId: freeOrg.id,
    role: "OWNER",
    email: "owner@phase3-free-test.example",
  };

  // Seed one ReadinessScore per demo org via the real scopedDb() write
  // path (the same path submitReadinessQuestionnaire uses), so the
  // cross-tenant history test below exercises the real code path.
  const responses = Object.fromEntries(READINESS_QUESTIONS.map((q) => [q.id, 2 as const]));
  const { scorePerDomain, overallScore } = computeReadinessScore(responses);

  const scoreA = await scopedDb(ORG_A).readinessScore.create({
    data: {
      questionnaireResponses: READINESS_QUESTIONS.map((q) => ({ questionId: q.id, value: 2 })),
      scorePerDomain,
      overallScore,
    },
  });
  readinessScoreIdA = scoreA.id;

  const scoreB = await scopedDb(ORG_B).readinessScore.create({
    data: {
      questionnaireResponses: READINESS_QUESTIONS.map((q) => ({ questionId: q.id, value: 1 })),
      scorePerDomain,
      overallScore,
    },
  });
  readinessScoreIdB = scoreB.id;

  // Seed one DRAFT and one PUBLISHED QGHubContent row directly (writes to
  // this table are otherwise BNCL_ADMIN-gated; this is test fixture setup,
  // analogous to prisma/seed.ts creating rows outside the app's normal
  // request flow).
  const draft = await rawPrisma.qGHubContent.create({
    data: {
      title: "Phase 3 Test Draft Article",
      category: "Testing",
      contentType: "ARTICLE",
      publishStatus: "DRAFT",
      body: "This should never be visible to a non-admin viewer.",
    },
  });
  draftContentId = draft.id;

  const published = await rawPrisma.qGHubContent.create({
    data: {
      title: "Phase 3 Test Published Article",
      category: "Testing",
      contentType: "ARTICLE",
      publishStatus: "PUBLISHED",
      body: "This should be visible to everyone.",
    },
  });
  publishedContentId = published.id;
  createdContentIds.push(draft.id, published.id);
});

afterAll(async () => {
  await rawPrisma.readinessScore.deleteMany({
    where: { id: { in: [readinessScoreIdA, readinessScoreIdB] } },
  });
  await rawPrisma.qGHubContent.deleteMany({ where: { id: { in: createdContentIds } } });
  await rawPrisma.organisation.delete({ where: { id: FREE_ORG_ID } });
  await rawPrisma.$disconnect();
});

describe("(b) Readiness scoring: pure function, correct for known inputs", () => {
  it("all-2 (Yes) answers score 100 per domain and 100 overall", () => {
    const responses = Object.fromEntries(READINESS_QUESTIONS.map((q) => [q.id, 2 as const]));
    const result = computeReadinessScore(responses);
    for (const domain of ["SAFE", "EFFECTIVE", "CARING", "RESPONSIVE", "WELL_LED"] as const) {
      expect(result.scorePerDomain[domain]).toBe(100);
    }
    expect(result.overallScore).toBe(100);
  });

  it("all-0 (No) answers score 0 per domain and 0 overall", () => {
    const responses = Object.fromEntries(READINESS_QUESTIONS.map((q) => [q.id, 0 as const]));
    const result = computeReadinessScore(responses);
    for (const domain of ["SAFE", "EFFECTIVE", "CARING", "RESPONSIVE", "WELL_LED"] as const) {
      expect(result.scorePerDomain[domain]).toBe(0);
    }
    expect(result.overallScore).toBe(0);
  });

  it("mixed known answers produce exactly the hand-computed scores", () => {
    // safe-*: 2,2,2 -> 6/6 -> 100
    // effective-*: 1,1,1 -> 3/6 -> 50
    // caring-*: 0,0,0 -> 0/6 -> 0
    // responsive-*: 2,0,1 -> 3/6 -> 50
    // well_led-*: 2,2,0 -> 4/6 -> 66.7
    // overall: mean(100,50,0,50,66.7) = 53.34 -> rounds to 53.3
    const responses = {
      "safe-1": 2, "safe-2": 2, "safe-3": 2,
      "effective-1": 1, "effective-2": 1, "effective-3": 1,
      "caring-1": 0, "caring-2": 0, "caring-3": 0,
      "responsive-1": 2, "responsive-2": 0, "responsive-3": 1,
      "well_led-1": 2, "well_led-2": 2, "well_led-3": 0,
    } as const;

    const result = computeReadinessScore(responses);
    expect(result.scorePerDomain.SAFE).toBe(100);
    expect(result.scorePerDomain.EFFECTIVE).toBe(50);
    expect(result.scorePerDomain.CARING).toBe(0);
    expect(result.scorePerDomain.RESPONSIVE).toBe(50);
    expect(result.scorePerDomain.WELL_LED).toBe(66.7);
    expect(result.overallScore).toBe(53.3);
  });

  it("throws on a missing answer rather than silently defaulting it", () => {
    const incomplete = Object.fromEntries(
      READINESS_QUESTIONS.slice(1).map((q) => [q.id, 1 as const])
    );
    expect(() => computeReadinessScore(incomplete)).toThrow(/missing answer/);
  });

  it("is a pure function: identical input produces identical output across repeated calls", () => {
    const responses = Object.fromEntries(READINESS_QUESTIONS.map((q) => [q.id, 1 as const]));
    const first = computeReadinessScore(responses);
    const second = computeReadinessScore(responses);
    expect(second).toEqual(first);
  });
});

describe("(a) Readiness history: cross-tenant isolation", () => {
  it("Org A's scoped history contains its own score and none of Org B's", async () => {
    const historyA = await scopedDb(ORG_A).readinessScore.findMany({
      orderBy: { dateTaken: "asc" },
    });
    expect(historyA.some((s) => s.id === readinessScoreIdA)).toBe(true);
    expect(historyA.some((s) => s.id === readinessScoreIdB)).toBe(false);
    expect(historyA.every((s) => s.orgId === ORG_A)).toBe(true);
  });

  it("Org B's scoped history contains its own score and none of Org A's", async () => {
    const historyB = await scopedDb(ORG_B).readinessScore.findMany({
      orderBy: { dateTaken: "asc" },
    });
    expect(historyB.some((s) => s.id === readinessScoreIdB)).toBe(true);
    expect(historyB.some((s) => s.id === readinessScoreIdA)).toBe(false);
    expect(historyB.every((s) => s.orgId === ORG_B)).toBe(true);
  });

  it("Org A cannot read Org B's ReadinessScore by id directly (findUnique)", async () => {
    const result = await scopedDb(ORG_A).readinessScore.findUnique({
      where: { id: readinessScoreIdB },
    });
    expect(result).toBeNull();
  });

  it("Org A cannot read Org B's ReadinessScore even via a spoofed orgId filter (findMany)", async () => {
    const results = await scopedDb(ORG_A).readinessScore.findMany({
      where: { orgId: ORG_B },
    });
    expect(results.some((s) => s.id === readinessScoreIdB)).toBe(false);
    expect(results.every((s) => s.orgId === ORG_A)).toBe(true);
  });
});

describe("(c) requireTier(): FREE-tier org session gets rejected, PAID-tier passes", () => {
  it("rejects a FREE-tier org's session when PAID is required", async () => {
    await expect(requireTier(freeOrgSession, "PAID")).rejects.toThrow(TierRequiredError);
  });

  it("accepts a PAID-tier org's session when PAID is required", async () => {
    await expect(requireTier(ownerSessionA, "PAID")).resolves.toBeUndefined();
    await expect(requireTier(ownerSessionB, "PAID")).resolves.toBeUndefined();
  });

  it("never rejects when FREE is required, regardless of the org's actual tier", async () => {
    await expect(requireTier(freeOrgSession, "FREE")).resolves.toBeUndefined();
    await expect(requireTier(ownerSessionA, "FREE")).resolves.toBeUndefined();
  });

  it("re-reads the tier fresh from the database (no staleness): a tier flip takes effect immediately", async () => {
    await expect(requireTier(freeOrgSession, "PAID")).rejects.toThrow(TierRequiredError);

    await rawPrisma.organisation.update({
      where: { id: FREE_ORG_ID },
      data: { subscriptionTier: "PAID" },
    });
    await expect(requireTier(freeOrgSession, "PAID")).resolves.toBeUndefined();

    // restore for isolation from other tests in this file
    await rawPrisma.organisation.update({
      where: { id: FREE_ORG_ID },
      data: { subscriptionTier: "FREE" },
    });
    await expect(requireTier(freeOrgSession, "PAID")).rejects.toThrow(TierRequiredError);
  });
});

describe("Q&G Hub: published-only reads for non-admins", () => {
  it("a non-admin viewer's list includes the published item and excludes the draft", async () => {
    const items = await listQGHubContentForViewer(ownerSessionA);
    expect(items.some((i) => i.id === publishedContentId)).toBe(true);
    expect(items.some((i) => i.id === draftContentId)).toBe(false);
  });

  it("a BNCL_ADMIN viewer's list includes both the published item and the draft", async () => {
    const items = await listQGHubContentForViewer(bnclAdminSession);
    expect(items.some((i) => i.id === publishedContentId)).toBe(true);
    expect(items.some((i) => i.id === draftContentId)).toBe(true);
  });

  it("a non-admin viewer fetching a draft by id gets null (indistinguishable from not-found)", async () => {
    const content = await getQGHubContentForViewer(ownerSessionA, draftContentId);
    expect(content).toBeNull();
  });

  it("a non-admin viewer fetching a published item by id gets the content", async () => {
    const content = await getQGHubContentForViewer(ownerSessionA, publishedContentId);
    expect(content?.id).toBe(publishedContentId);
  });
});

describe("(d) Q&G Hub: a non-BNCL_ADMIN cannot write QGHubContent", () => {
  it("createQGHubContent rejects a non-BNCL_ADMIN session (org Owner)", async () => {
    await expect(
      createQGHubContent(ownerSessionA, {
        title: "Should never be created",
        category: "Testing",
        contentType: "ARTICLE",
        publishStatus: "PUBLISHED",
      })
    ).rejects.toThrow(BnclAdminRequiredError);
  });

  it("updateQGHubContent rejects a non-BNCL_ADMIN session, and the row is left untouched", async () => {
    await expect(
      updateQGHubContent(ownerSessionA, draftContentId, { title: "HACKED BY ORG A OWNER" })
    ).rejects.toThrow(BnclAdminRequiredError);

    const stillIntact = await rawPrisma.qGHubContent.findUniqueOrThrow({
      where: { id: draftContentId },
    });
    expect(stillIntact.title).toBe("Phase 3 Test Draft Article");
  });

  it("no content matching the rejected write's title exists anywhere (proves the create was actually rejected, not merely that a promise threw)", async () => {
    const found = await rawPrisma.qGHubContent.findFirst({
      where: { title: "Should never be created" },
    });
    expect(found).toBeNull();
  });

  it("positive control: createQGHubContent succeeds for a real BNCL_ADMIN session", async () => {
    const created = await createQGHubContent(bnclAdminSession, {
      title: "Phase 3 Test Admin-Created Article",
      category: "Testing",
      contentType: "LESSON",
      publishStatus: "DRAFT",
    });
    createdContentIds.push(created.id);
    expect(created.title).toBe("Phase 3 Test Admin-Created Article");
  });
});
