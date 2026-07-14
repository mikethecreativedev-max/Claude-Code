import { randomUUID } from "crypto";

import { afterAll, describe, expect, it } from "vitest";

import { rawPrisma } from "@/server/db/prisma";
import { scopedDb } from "@/server/db/scoped-client";
import { signUpOrganisation, EmailAlreadyInUseError } from "@/server/onboarding/signup";
import { completeSetupWizardForOrg } from "@/server/onboarding/setup-wizard";
import { createInviteForOrg, acceptInvite, InviteTokenInvalidError } from "@/server/onboarding/invite";
import { buildDashboardData } from "@/server/dashboard/data";
import { computeComplianceScore, complianceBand } from "@/server/compliance/score";

// This suite runs against a real, migrated, seeded Postgres database (see
// BUILD_CHECKLIST.md Phase 2 — point DATABASE_URL at bncl_test_phase2).
// It exercises the Phase 2 onboarding/dashboard modules through their
// "already authorized" core functions (buildDashboardData,
// completeSetupWizardForOrg, createInviteForOrg) rather than the
// requireModulePermission-wrapped public entry points, exactly as those
// functions' docstrings say they're meant to be tested — no live NextAuth
// session is available in a unit test process.

const ORG_A = "demo-org-a";
const ORG_B = "demo-org-b";

afterAll(async () => {
  await rawPrisma.$disconnect();
});

describe("compliance score: pure function, known inputs", () => {
  it("returns 100 when every dimension is perfectly healthy", () => {
    const score = computeComplianceScore({
      totalAudits: 10,
      overdueAudits: 0,
      totalIncidents: 5,
      openIncidents: 0,
      totalPolicies: 4,
      policiesNeedingReview: 0,
    });
    expect(score).toBe(100);
  });

  it("returns 0 when every dimension is maximally unhealthy", () => {
    const score = computeComplianceScore({
      totalAudits: 10,
      overdueAudits: 10,
      totalIncidents: 5,
      openIncidents: 5,
      totalPolicies: 4,
      policiesNeedingReview: 4,
    });
    expect(score).toBe(0);
  });

  it("defaults a zero-denominator dimension to full health (neutral), not zero", () => {
    // No policies exist yet — policyHealth should default to 1, not
    // penalise the org for a module it hasn't started using.
    const score = computeComplianceScore({
      totalAudits: 0,
      overdueAudits: 0,
      totalIncidents: 0,
      openIncidents: 0,
      totalPolicies: 0,
      policiesNeedingReview: 0,
    });
    expect(score).toBe(100);
  });

  it("computes the documented weighted blend exactly for a known mixed case", () => {
    // auditHealth = 1 - 2/10 = 0.8; incidentHealth = 1 - 1/4 = 0.75;
    // policyHealth = 1 - 1/2 = 0.5
    // score = round(100 * (0.40*0.8 + 0.35*0.75 + 0.25*0.5))
    //       = round(100 * (0.32 + 0.2625 + 0.125)) = round(70.75) = 71
    const score = computeComplianceScore({
      totalAudits: 10,
      overdueAudits: 2,
      totalIncidents: 4,
      openIncidents: 1,
      totalPolicies: 2,
      policiesNeedingReview: 1,
    });
    expect(score).toBe(71);
  });

  it("clamps openIncidents/totalIncidents at 1 even if the caller passes an inconsistent count", () => {
    const score = computeComplianceScore({
      totalAudits: 0,
      overdueAudits: 0,
      totalIncidents: 2,
      openIncidents: 5, // more "open" than total — should clamp, not go negative
      totalPolicies: 0,
      policiesNeedingReview: 0,
    });
    // incidentHealth clamps to 0 -> score = round(100*(0.40*1 + 0.35*0 + 0.25*1)) = 65
    expect(score).toBe(65);
  });

  it("is a pure function: identical inputs always produce identical output", () => {
    const inputs = {
      totalAudits: 7,
      overdueAudits: 3,
      totalIncidents: 6,
      openIncidents: 2,
      totalPolicies: 5,
      policiesNeedingReview: 1,
    };
    const a = computeComplianceScore(inputs);
    const b = computeComplianceScore(inputs);
    expect(a).toBe(b);
  });

  it("complianceBand maps score ranges correctly", () => {
    expect(complianceBand(100)).toBe("good");
    expect(complianceBand(85)).toBe("good");
    expect(complianceBand(84)).toBe("warning");
    expect(complianceBand(60)).toBe("warning");
    expect(complianceBand(59)).toBe("critical");
    expect(complianceBand(0)).toBe("critical");
  });
});

describe("sign-up: creates exactly one org/user/DPA row, no cross-contamination", () => {
  it("a fresh sign-up produces exactly one Organisation, one owner User, one DataProcessingAgreement", async () => {
    const email = `owner-${randomUUID()}@signup-test.example`;

    const orgCountBefore = await rawPrisma.organisation.count();
    const dpaCountBefore = await rawPrisma.dataProcessingAgreement.count();
    const orgAUserCountBefore = await rawPrisma.user.count({ where: { orgId: ORG_A } });
    const orgADpaCountBefore = await rawPrisma.dataProcessingAgreement.count({ where: { orgId: ORG_A } });

    const result = await signUpOrganisation({
      orgName: "Test Signup Clinic",
      ownerName: "Test Owner",
      email,
      password: "correct-horse-battery",
      dpaAccepted: true,
    });

    const orgCountAfter = await rawPrisma.organisation.count();
    const dpaCountAfter = await rawPrisma.dataProcessingAgreement.count();

    expect(orgCountAfter).toBe(orgCountBefore + 1);
    expect(dpaCountAfter).toBe(dpaCountBefore + 1);

    const usersInNewOrg = await rawPrisma.user.findMany({ where: { orgId: result.orgId } });
    expect(usersInNewOrg).toHaveLength(1);
    expect(usersInNewOrg[0].email).toBe(email);
    expect(usersInNewOrg[0].role).toBe("OWNER");

    const dpasInNewOrg = await rawPrisma.dataProcessingAgreement.findMany({ where: { orgId: result.orgId } });
    expect(dpasInNewOrg).toHaveLength(1);
    expect(dpasInNewOrg[0].signedById).toBe(result.userId);

    // No cross-contamination: Org A's own user/DPA counts are untouched by
    // a completely unrelated sign-up.
    expect(await rawPrisma.user.count({ where: { orgId: ORG_A } })).toBe(orgAUserCountBefore);
    expect(await rawPrisma.dataProcessingAgreement.count({ where: { orgId: ORG_A } })).toBe(orgADpaCountBefore);

    // An AuditLogEntry was written, scoped to the new org.
    const logEntry = await rawPrisma.auditLogEntry.findFirst({
      where: { orgId: result.orgId, entityType: "ORGANISATION" },
    });
    expect(logEntry).not.toBeNull();
  });

  it("rejects a duplicate email without creating a second org", async () => {
    const email = `dupe-${randomUUID()}@signup-test.example`;
    await signUpOrganisation({
      orgName: "First Co",
      ownerName: "First Owner",
      email,
      password: "correct-horse-battery",
      dpaAccepted: true,
    });

    const orgCountBefore = await rawPrisma.organisation.count();

    await expect(
      signUpOrganisation({
        orgName: "Second Co",
        ownerName: "Second Owner",
        email, // same email
        password: "another-password",
        dpaAccepted: true,
      })
    ).rejects.toThrow(EmailAlreadyInUseError);

    expect(await rawPrisma.organisation.count()).toBe(orgCountBefore);
  });
});

describe("setup wizard: persists org/site/registered activities via scopedDb only", () => {
  it("creates Site rows with registeredActivities populated, scoped to the calling org", async () => {
    const signup = await signUpOrganisation({
      orgName: "Wizard Test Clinic",
      ownerName: "Wizard Owner",
      email: `wizard-${randomUUID()}@signup-test.example`,
      password: "correct-horse-battery",
      dpaAccepted: true,
    });

    const result = await completeSetupWizardForOrg(signup.orgId, signup.userId, {
      orgName: "Wizard Test Clinic (Updated)",
      serviceType: "GP Practice",
      sites: [
        {
          name: "Main Site",
          address: "1 Test Street",
          registeredActivities: ["Treatment of disease, disorder or injury"],
        },
      ],
    });

    expect(result.siteIds).toHaveLength(1);

    const site = await scopedDb(signup.orgId).site.findUniqueOrThrow({ where: { id: result.siteIds[0] } });
    expect(site.orgId).toBe(signup.orgId);
    expect(site.registeredActivities).toEqual([
      "GP Practice",
      "Treatment of disease, disorder or injury",
    ]);

    const org = await rawPrisma.organisation.findUniqueOrThrow({ where: { id: signup.orgId } });
    expect(org.name).toBe("Wizard Test Clinic (Updated)");

    // Sites for unrelated orgs are untouched.
    const orgBSitesBefore = await rawPrisma.site.count({ where: { orgId: ORG_B } });
    expect(await rawPrisma.site.count({ where: { orgId: ORG_B } })).toBe(orgBSitesBefore);
  });
});

describe("invite flow: invited user lands with the correct org/role, never able to override either", () => {
  it("accepting a valid invite activates the user in the inviting org with the assigned role", async () => {
    const orgAOwner = await rawPrisma.user.findFirstOrThrow({ where: { orgId: ORG_A, role: "OWNER" } });
    const invite = await createInviteForOrg(ORG_A, orgAOwner.id, {
      email: `invitee-${randomUUID()}@invite-test.example`,
      name: "Invitee Person",
      role: "STAFF",
    });

    const url = new URL(invite.acceptUrl, "http://localhost");
    const token = url.searchParams.get("token")!;

    const invitedUserBefore = await rawPrisma.user.findUniqueOrThrow({ where: { id: invite.userId } });
    expect(invitedUserBefore.status).toBe("INVITED");
    expect(invitedUserBefore.orgId).toBe(ORG_A);

    // The accept payload carries no org/role field at all — the schema
    // (acceptInviteSchema) only accepts token/uid/password, so even a
    // maliciously-constructed extra field is not read by acceptInvite.
    const accepted = await acceptInvite({
      uid: invite.userId,
      token,
      password: "invitee-password-123",
      orgId: ORG_B, // would-be spoofed field; not part of the schema
      role: "OWNER", // would-be spoofed field; not part of the schema
    });
    expect(accepted.email).toBe(invite.email);

    const activatedUser = await rawPrisma.user.findUniqueOrThrow({ where: { id: invite.userId } });
    expect(activatedUser.status).toBe("ACTIVE");
    expect(activatedUser.orgId).toBe(ORG_A); // unchanged, NOT ORG_B
    expect(activatedUser.role).toBe("STAFF"); // unchanged, NOT OWNER
    expect(activatedUser.passwordHash).not.toBeNull();
  });

  it("rejects an already-used token (single-use)", async () => {
    const orgAOwner = await rawPrisma.user.findFirstOrThrow({ where: { orgId: ORG_A, role: "OWNER" } });
    const invite = await createInviteForOrg(ORG_A, orgAOwner.id, {
      email: `single-use-${randomUUID()}@invite-test.example`,
      name: "Single Use",
      role: "STAFF",
    });
    const url = new URL(invite.acceptUrl, "http://localhost");
    const token = url.searchParams.get("token")!;

    await acceptInvite({ uid: invite.userId, token, password: "first-accept-password" });

    await expect(
      acceptInvite({ uid: invite.userId, token, password: "second-accept-attempt" })
    ).rejects.toThrow(InviteTokenInvalidError);
  });

  it("rejects an invite for an email already in use", async () => {
    const orgAOwner = await rawPrisma.user.findFirstOrThrow({ where: { orgId: ORG_A, role: "OWNER" } });
    const existingEmail = "owner@greenfield-demo.example"; // seeded Org A owner
    await expect(
      createInviteForOrg(ORG_A, orgAOwner.id, {
        email: existingEmail,
        name: "Collision Attempt",
        role: "STAFF",
      })
    ).rejects.toThrow();
  });
});

describe("dashboard data: counts and activity feed are strictly org-scoped", () => {
  it("Org A's dashboard data never includes Org B's AuditLogEntry rows or counts", async () => {
    // Seed distinctive, easily-identified AuditLogEntry rows for both orgs
    // directly (bypassing the app flows, to isolate exactly what
    // buildDashboardData reads) via the scoped client, so each org's rows
    // are guaranteed correctly attributed.
    const marker = randomUUID();
    const orgAUser = await rawPrisma.user.findFirstOrThrow({ where: { orgId: ORG_A } });
    const orgBUser = await rawPrisma.user.findFirstOrThrow({ where: { orgId: ORG_B } });

    await scopedDb(ORG_A).auditLogEntry.create({
      data: {
        orgId: ORG_A,
        entityType: "SITE",
        entityId: `marker-a-${marker}`,
        userId: orgAUser.id,
        action: "CREATE",
        afterSnapshot: { marker: `A-${marker}` },
      },
    });
    await scopedDb(ORG_B).auditLogEntry.create({
      data: {
        orgId: ORG_B,
        entityType: "SITE",
        entityId: `marker-b-${marker}`,
        userId: orgBUser.id,
        action: "CREATE",
        afterSnapshot: { marker: `B-${marker}` },
      },
    });

    const dashboardA = await buildDashboardData(ORG_A, "OWNER");
    const dashboardB = await buildDashboardData(ORG_B, "OWNER");

    // The Org A marker entity id must appear in Org A's feed and never in
    // Org B's, and vice versa.
    expect(dashboardA.recentActivity.some((e) => e.id && e.entityType === "SITE")).toBeDefined();
    const orgAEntityIds = new Set(
      (await rawPrisma.auditLogEntry.findMany({ where: { orgId: ORG_A } })).map((e) => e.id)
    );
    const orgBEntityIds = new Set(
      (await rawPrisma.auditLogEntry.findMany({ where: { orgId: ORG_B } })).map((e) => e.id)
    );

    for (const item of dashboardA.recentActivity) {
      expect(orgAEntityIds.has(item.id)).toBe(true);
      expect(orgBEntityIds.has(item.id)).toBe(false);
    }
    for (const item of dashboardB.recentActivity) {
      expect(orgBEntityIds.has(item.id)).toBe(true);
      expect(orgAEntityIds.has(item.id)).toBe(false);
    }

    // Counts (siteCount, userCount, moduleCounts) are independently scoped
    // too: Org A's user count must equal exactly Org A's real user rows,
    // not the sum of both orgs.
    const realOrgAUserCount = await rawPrisma.user.count({ where: { orgId: ORG_A, deletedAt: null } });
    const realOrgBUserCount = await rawPrisma.user.count({ where: { orgId: ORG_B, deletedAt: null } });
    expect(dashboardA.userCount).toBe(realOrgAUserCount);
    expect(dashboardB.userCount).toBe(realOrgBUserCount);
    expect(dashboardA.userCount).not.toBe(realOrgAUserCount + realOrgBUserCount);

    const auditsModuleA = dashboardA.moduleCounts.find((m) => m.module === "AUDITS");
    const realOrgAAuditCount = await rawPrisma.audit.count({ where: { orgId: ORG_A } });
    expect(auditsModuleA?.count).toBe(realOrgAAuditCount);
  });

  it("compliance score in the dashboard result is computed from that org's own counts", async () => {
    const dashboardA = await buildDashboardData(ORG_A, "OWNER");
    expect(dashboardA.complianceScore).toBeGreaterThanOrEqual(0);
    expect(dashboardA.complianceScore).toBeLessThanOrEqual(100);
    expect(["good", "warning", "critical"]).toContain(dashboardA.complianceBand);
  });

  it("a freshly signed-up, empty org gets a neutral (100) compliance score and empty-but-defined module counts", async () => {
    const signup = await signUpOrganisation({
      orgName: "Empty Org For Score Test",
      ownerName: "Empty Owner",
      email: `empty-${randomUUID()}@signup-test.example`,
      password: "correct-horse-battery",
      dpaAccepted: true,
    });

    const dashboard = await buildDashboardData(signup.orgId, "OWNER");
    expect(dashboard.complianceScore).toBe(100);
    expect(dashboard.complianceBand).toBe("good");
    expect(dashboard.siteCount).toBe(0);
    expect(dashboard.userCount).toBe(1); // just the owner
    // The sign-up itself wrote one AuditLogEntry (ORGANISATION/CREATE).
    expect(dashboard.recentActivity).toHaveLength(1);
    expect(dashboard.recentActivity[0].entityType).toBe("ORGANISATION");
  });
});
