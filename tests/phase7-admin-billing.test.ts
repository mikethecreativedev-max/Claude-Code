import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────
// This suite runs against a real, migrated, seeded Postgres database
// (DATABASE_URL should point at bncl_test_phase7 — see BUILD_CHECKLIST.md
// Phase 7). It proves the Phase 7 acceptance criteria:
//   (a) STAFF/REGISTERED_MANAGER cannot self-escalate to OWNER or edit
//       others' roles without ADMIN_USERS approve/edit permission
//   (b) Org A's data export contains zero Org B data
//   (c) an unsigned/forged webhook payload is rejected (400)
//   (d) a validly-signed simulated webhook event correctly and immediately
//       flips Organisation.subscriptionTier (no stale reads)
//   (e) a non-BNCL_ADMIN is rejected from every new BNCL super-admin action
//
// getServerSession (next-auth) is mocked so business-logic functions can be
// exercised directly with a controlled SessionUser, exactly the way
// requireAuth() would construct one from a real cookie-backed session —
// nothing about the RBAC/tenant-scoping code under test is mocked.
// ─────────────────────────────────────────────────────────────────────────

const mockGetServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

function mockSession(session: { id: string; orgId: string; role: string; email: string }) {
  mockGetServerSession.mockResolvedValue({ user: session });
}

function mockNoSession() {
  mockGetServerSession.mockResolvedValue(null);
}

import { rawPrisma } from "@/server/db/prisma";
import { changeUserRole, disableUser, SelfDemotionBlockedError } from "@/server/admin/users";
import { ForbiddenError } from "@/server/rbac/permissions";
import { exportOrgData } from "@/server/data-protection/dpa";
import {
  createQGHubContent,
  updateQGHubContent,
  publishQGHubContent,
  unpublishQGHubContent,
  deleteQGHubContent,
  BnclAdminRequiredError,
} from "@/server/bncl-admin/client";
import {
  verifyStripeWebhook,
  applyStripeEvent,
  WebhookSignatureError,
} from "@/server/billing/webhook";
import { getStripeClient, __resetStripeClientForTests } from "@/server/billing/stripe-client";
import { POST as stripeWebhookRoute } from "@/app/api/webhooks/stripe/route";

const ORG_A = "demo-org-a";
const ORG_B = "demo-org-b";

const TEST_WEBHOOK_SECRET = "whsec_test_phase7_secret";

type SeededUser = { id: string; email: string; role: string; orgId: string };

let orgAOwner: SeededUser;
let orgAManager: SeededUser;
let orgAStaff: SeededUser;
let orgBOwner: SeededUser;

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_phase7_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  __resetStripeClientForTests();

  const [a1, a2, a3, b1] = await Promise.all([
    rawPrisma.user.findFirstOrThrow({ where: { orgId: ORG_A, role: "OWNER" } }),
    rawPrisma.user.findFirstOrThrow({ where: { orgId: ORG_A, role: "REGISTERED_MANAGER" } }),
    rawPrisma.user.findFirstOrThrow({ where: { orgId: ORG_A, role: "STAFF" } }),
    rawPrisma.user.findFirstOrThrow({ where: { orgId: ORG_B, role: "OWNER" } }),
  ]);
  orgAOwner = { id: a1.id, email: a1.email, role: a1.role, orgId: a1.orgId };
  orgAManager = { id: a2.id, email: a2.email, role: a2.role, orgId: a2.orgId };
  orgAStaff = { id: a3.id, email: a3.email, role: a3.role, orgId: a3.orgId };
  orgBOwner = { id: b1.id, email: b1.email, role: b1.role, orgId: b1.orgId };

  // A DPA row that belongs ONLY to Org B, so if the export's org-scoping
  // ever regressed, Org A's export would visibly contain it.
  await rawPrisma.dataProcessingAgreement.upsert({
    where: { id: "phase7-test-org-b-dpa" },
    update: {},
    create: {
      id: "phase7-test-org-b-dpa",
      orgId: ORG_B,
      signedById: orgBOwner.id,
      signedDate: new Date(),
      version: "phase7-test-v1",
    },
  });
});

afterAll(async () => {
  await rawPrisma.dataProcessingAgreement.deleteMany({ where: { id: "phase7-test-org-b-dpa" } });
  await rawPrisma.$disconnect();
});

beforeEach(() => {
  mockGetServerSession.mockReset();
});

// ═══════════════════════════════════════════════════════════════════════
// (a) Self-escalation / role-management RBAC
// ═══════════════════════════════════════════════════════════════════════
describe("(a) role management: no self-privilege-escalation, ADMIN_USERS approve/edit enforced", () => {
  it("STAFF cannot change ANY user's role (lacks edit on ADMIN_USERS)", async () => {
    mockSession(orgAStaff);
    await expect(
      changeUserRole({ userId: orgAManager.id, role: "OWNER" })
    ).rejects.toThrow(ForbiddenError);
  });

  it("STAFF cannot self-escalate to OWNER", async () => {
    mockSession(orgAStaff);
    await expect(
      changeUserRole({ userId: orgAStaff.id, role: "OWNER" })
    ).rejects.toThrow(ForbiddenError);
  });

  it("REGISTERED_MANAGER cannot promote another user to OWNER (has edit, lacks approve)", async () => {
    mockSession(orgAManager);
    await expect(
      changeUserRole({ userId: orgAStaff.id, role: "OWNER" })
    ).rejects.toThrow(ForbiddenError);
  });

  it("REGISTERED_MANAGER cannot self-escalate to OWNER (has edit, lacks approve)", async () => {
    mockSession(orgAManager);
    await expect(
      changeUserRole({ userId: orgAManager.id, role: "OWNER" })
    ).rejects.toThrow(ForbiddenError);
  });

  it("REGISTERED_MANAGER cannot change their OWN role at all, even to a non-privileged role (self-demotion block, independent of the approve gate)", async () => {
    mockSession(orgAManager);
    await expect(
      changeUserRole({ userId: orgAManager.id, role: "STAFF" })
    ).rejects.toThrow(SelfDemotionBlockedError);
  });

  it("OWNER cannot change their OWN role either, despite having full ADMIN_USERS permissions", async () => {
    mockSession(orgAOwner);
    await expect(
      changeUserRole({ userId: orgAOwner.id, role: "REGISTERED_MANAGER" })
    ).rejects.toThrow(SelfDemotionBlockedError);
  });

  it("OWNER cannot disable their OWN account", async () => {
    mockSession(orgAOwner);
    await expect(disableUser({ userId: orgAOwner.id })).rejects.toThrow(SelfDemotionBlockedError);
  });

  it("REGISTERED_MANAGER CAN change another user's role to a non-OWNER role (has edit, approve not required)", async () => {
    mockSession(orgAManager);
    const updated = await changeUserRole({ userId: orgAStaff.id, role: "REGISTERED_MANAGER" });
    expect(updated.role).toBe("REGISTERED_MANAGER");

    // revert, as OWNER (has approve too, but STAFF is a non-OWNER target so
    // edit alone suffices) so later tests see the original seeded state
    mockSession(orgAOwner);
    const reverted = await changeUserRole({ userId: orgAStaff.id, role: "STAFF" });
    expect(reverted.role).toBe("STAFF");
  });

  it("OWNER CAN promote another user to OWNER (has both edit and approve)", async () => {
    mockSession(orgAOwner);
    const promoted = await changeUserRole({ userId: orgAStaff.id, role: "OWNER" });
    expect(promoted.role).toBe("OWNER");

    // revert
    const reverted = await changeUserRole({ userId: orgAStaff.id, role: "STAFF" });
    expect(reverted.role).toBe("STAFF");
  });

  it("an unauthenticated caller is rejected outright", async () => {
    mockNoSession();
    await expect(changeUserRole({ userId: orgAStaff.id, role: "OWNER" })).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (b) Org-scoped data export: zero cross-tenant leakage
// ═══════════════════════════════════════════════════════════════════════
describe("(b) Data Protection Centre export: org-scoped, zero cross-tenant data", () => {
  it("Org A's export contains zero Org B data", async () => {
    mockSession(orgAOwner);
    const result = await exportOrgData();

    expect(result.orgId).toBe(ORG_A);
    expect((result.data.organisation as { id: string }).id).toBe(ORG_A);

    const serialized = JSON.stringify(result.data);
    expect(serialized).not.toContain(ORG_B);
    expect(serialized).not.toContain("riverside-demo.example");
    expect(serialized).not.toContain("phase7-test-org-b-dpa");

    const users = result.data.users as { orgId?: string }[];
    expect(users.length).toBeGreaterThan(0);
    // The users exporter's select clause doesn't even project orgId, but we
    // already asserted above that no Org B identifying string appears
    // anywhere in the serialized export, which is the stronger guarantee.
    expect(users.every((u) => !("orgId" in u))).toBe(true);

    const sites = result.data.sites as { orgId: string }[];
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.every((s) => s.orgId === ORG_A)).toBe(true);

    const dpas = result.data.dataProcessingAgreements as { orgId: string }[];
    expect(dpas.every((d) => d.orgId === ORG_A)).toBe(true);
  });

  it("symmetric check: Org B's export contains zero Org A data", async () => {
    mockSession(orgBOwner);
    const result = await exportOrgData();

    expect(result.orgId).toBe(ORG_B);
    const serialized = JSON.stringify(result.data);
    expect(serialized).not.toContain(ORG_A);
    expect(serialized).not.toContain("greenfield-demo.example");

    const dpas = result.data.dataProcessingAgreements as { orgId: string }[];
    expect(dpas.some((d) => d.id === "phase7-test-org-b-dpa")).toBe(true);
    expect(dpas.every((d) => d.orgId === ORG_B)).toBe(true);
  });

  it("a non-privileged caller (STAFF, no ADMIN_DATA_PROTECTION view) cannot export at all", async () => {
    mockSession(orgAStaff);
    await expect(exportOrgData()).rejects.toThrow(ForbiddenError);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (c) Stripe webhook: signature verification is genuinely enforced
// ═══════════════════════════════════════════════════════════════════════
describe("(c) Stripe webhook signature verification: no trust-the-payload shortcut", () => {
  it("verifyStripeWebhook() rejects a forged signature", () => {
    const payload = JSON.stringify({ id: "evt_forged", type: "checkout.session.completed" });
    expect(() => verifyStripeWebhook(payload, "t=1,v1=not_a_real_signature")).toThrow(
      WebhookSignatureError
    );
  });

  it("verifyStripeWebhook() rejects a payload signed with the WRONG secret", () => {
    const payload = JSON.stringify({ id: "evt_wrong_secret", type: "checkout.session.completed" });
    const stripe = getStripeClient();
    const badSignature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_totally_different_secret",
    });
    expect(() => verifyStripeWebhook(payload, badSignature)).toThrow(WebhookSignatureError);
  });

  it("verifyStripeWebhook() rejects a TAMPERED body (signature was for different bytes)", () => {
    const originalPayload = JSON.stringify({ id: "evt_original", type: "checkout.session.completed" });
    const stripe = getStripeClient();
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: originalPayload,
      secret: TEST_WEBHOOK_SECRET,
    });
    const tamperedPayload = JSON.stringify({ id: "evt_TAMPERED", type: "checkout.session.completed" });
    expect(() => verifyStripeWebhook(tamperedPayload, signature)).toThrow(WebhookSignatureError);
  });

  it("the production route handler returns 400 for a request with NO stripe-signature header at all", async () => {
    const req = new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: JSON.stringify({ id: "evt_no_sig", type: "checkout.session.completed" }),
    });
    const res = await stripeWebhookRoute(req);
    expect(res.status).toBe(400);
  });

  it("the production route handler returns 400 for a forged/unsigned payload, and does NOT touch the database", async () => {
    const orgABefore = await rawPrisma.organisation.findUniqueOrThrow({ where: { id: ORG_A } });

    const req = new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=totally_forged_value" },
      body: JSON.stringify({
        id: "evt_forged_route",
        type: "checkout.session.completed",
        data: {
          object: {
            client_reference_id: ORG_A,
            customer: "cus_forged",
            subscription: "sub_forged",
          },
        },
      }),
    });
    const res = await stripeWebhookRoute(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/signature/i);

    const orgAAfter = await rawPrisma.organisation.findUniqueOrThrow({ where: { id: ORG_A } });
    expect(orgAAfter.subscriptionTier).toBe(orgABefore.subscriptionTier);
    expect(orgAAfter.stripeCustomerId).toBe(orgABefore.stripeCustomerId);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (d) Validly-signed webhook flips subscriptionTier immediately, no stale reads
// ═══════════════════════════════════════════════════════════════════════
describe("(d) validly-signed webhook immediately flips Organisation billing fields", () => {
  beforeEach(async () => {
    // Reset Org A to a known FREE/TRIALING baseline before each test in
    // this block so the flip is unambiguous.
    await rawPrisma.organisation.update({
      where: { id: ORG_A },
      data: {
        subscriptionTier: "FREE",
        billingStatus: "TRIALING",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      },
    });
  });

  afterAll(async () => {
    // Restore the seeded PAID/ACTIVE baseline other suites/pages expect.
    await rawPrisma.organisation.update({
      where: { id: ORG_A },
      data: { subscriptionTier: "PAID", billingStatus: "ACTIVE" },
    });
  });

  function signedRequest(eventPayload: object) {
    const payload = JSON.stringify(eventPayload);
    const stripe = getStripeClient();
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: TEST_WEBHOOK_SECRET,
    });
    return new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body: payload,
    });
  }

  it("checkout.session.completed (validly signed) flips FREE -> PAID / ACTIVE immediately, via the real route handler", async () => {
    const req = signedRequest({
      id: "evt_checkout_completed_phase7",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          object: "checkout.session",
          client_reference_id: ORG_A,
          metadata: { orgId: ORG_A },
          customer: "cus_test_phase7",
          subscription: "sub_test_phase7",
        },
      },
    });

    const res = await stripeWebhookRoute(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toEqual({ applied: true, orgId: ORG_A, eventType: "checkout.session.completed" });

    // Immediate, non-cached re-read — no stale reads.
    const org = await rawPrisma.organisation.findUniqueOrThrow({ where: { id: ORG_A } });
    expect(org.subscriptionTier).toBe("PAID");
    expect(org.billingStatus).toBe("ACTIVE");
    expect(org.stripeCustomerId).toBe("cus_test_phase7");
    expect(org.stripeSubscriptionId).toBe("sub_test_phase7");
  });

  it("customer.subscription.deleted (validly signed) flips back to FREE / CANCELED immediately", async () => {
    // First bring Org A to PAID/ACTIVE with known Stripe ids via the
    // already-verified applyStripeEvent path (unit-level, not the route),
    // to set up the subscription-matching fixture.
    await rawPrisma.organisation.update({
      where: { id: ORG_A },
      data: {
        subscriptionTier: "PAID",
        billingStatus: "ACTIVE",
        stripeCustomerId: "cus_test_phase7_del",
        stripeSubscriptionId: "sub_test_phase7_del",
      },
    });

    const req = signedRequest({
      id: "evt_sub_deleted_phase7",
      object: "event",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_test_phase7_del",
          object: "subscription",
          status: "canceled",
          customer: "cus_test_phase7_del",
        },
      },
    });

    const res = await stripeWebhookRoute(req);
    expect(res.status).toBe(200);

    const org = await rawPrisma.organisation.findUniqueOrThrow({ where: { id: ORG_A } });
    expect(org.subscriptionTier).toBe("FREE");
    expect(org.billingStatus).toBe("CANCELED");
  });

  it("a paid-tier gate re-reads fresh from the DB, so the flip is visible on the very next call (no caching)", async () => {
    const { requireTier, TierRequiredError } = await import("@/server/billing/tier");
    mockSession(orgAOwner);
    await expect(requireTier("PAID")).rejects.toThrow(TierRequiredError);

    const req = signedRequest({
      id: "evt_checkout_completed_phase7_tier",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_tier",
          object: "checkout.session",
          client_reference_id: ORG_A,
          customer: "cus_test_tier",
          subscription: "sub_test_tier",
        },
      },
    });
    await stripeWebhookRoute(req);

    mockSession(orgAOwner);
    await expect(requireTier("PAID")).resolves.toMatchObject({ orgId: ORG_A });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// (e) BNCL super-admin Q&G Hub actions: every new action rejects non-BNCL_ADMIN
// ═══════════════════════════════════════════════════════════════════════
describe("(e) BNCL super-admin Q&G Hub content management: non-BNCL_ADMIN rejected everywhere", () => {
  const nonAdminSessions = [
    { label: "org OWNER", get: () => orgAOwner },
    { label: "org REGISTERED_MANAGER", get: () => orgAManager },
    { label: "org STAFF", get: () => orgAStaff },
  ];

  for (const { label, get } of nonAdminSessions) {
    it(`createQGHubContent rejects a ${label} session`, async () => {
      mockSession(get());
      await expect(
        createQGHubContent({ title: "x", category: "y", contentType: "ARTICLE" })
      ).rejects.toThrow(BnclAdminRequiredError);
    });

    it(`updateQGHubContent rejects a ${label} session`, async () => {
      mockSession(get());
      await expect(updateQGHubContent({ id: "does-not-matter", title: "x" })).rejects.toThrow(
        BnclAdminRequiredError
      );
    });

    it(`publishQGHubContent rejects a ${label} session`, async () => {
      mockSession(get());
      await expect(publishQGHubContent("does-not-matter")).rejects.toThrow(BnclAdminRequiredError);
    });

    it(`unpublishQGHubContent rejects a ${label} session`, async () => {
      mockSession(get());
      await expect(unpublishQGHubContent("does-not-matter")).rejects.toThrow(BnclAdminRequiredError);
    });

    it(`deleteQGHubContent rejects a ${label} session`, async () => {
      mockSession(get());
      await expect(deleteQGHubContent("does-not-matter")).rejects.toThrow(BnclAdminRequiredError);
    });
  }

  it("unauthenticated caller is rejected from createQGHubContent too", async () => {
    mockNoSession();
    await expect(
      createQGHubContent({ title: "x", category: "y", contentType: "ARTICLE" })
    ).rejects.toThrow();
  });

  it("sanity check: a genuine BNCL_ADMIN CAN create/publish/unpublish/delete Q&G Hub content", async () => {
    const bnclAdmin = await rawPrisma.user.findFirstOrThrow({ where: { role: "BNCL_ADMIN" } });
    mockSession({ id: bnclAdmin.id, orgId: bnclAdmin.orgId, role: "BNCL_ADMIN", email: bnclAdmin.email });

    const created = await createQGHubContent({
      title: "Phase 7 test content",
      category: "Test",
      contentType: "ARTICLE",
      body: "test body",
    });
    expect(created.publishStatus).toBe("DRAFT");

    const published = await publishQGHubContent(created.id);
    expect(published.publishStatus).toBe("PUBLISHED");

    const unpublished = await unpublishQGHubContent(created.id);
    expect(unpublished.publishStatus).toBe("DRAFT");

    await deleteQGHubContent(created.id);
    const stillThere = await rawPrisma.qGHubContent.findUnique({ where: { id: created.id } });
    expect(stillThere).toBeNull();
  });
});
