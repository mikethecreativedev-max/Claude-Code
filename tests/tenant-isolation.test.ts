import { afterAll, describe, expect, it } from "vitest";

import { rawPrisma } from "@/server/db/prisma";
import { scopedDb } from "@/server/db/scoped-client";
import { getModulePermission } from "@/server/rbac/permissions";
import { assertBnclAdmin, BnclAdminRequiredError } from "@/server/bncl-admin/client";
import type { SessionUser } from "@/server/auth/session";

// This suite runs against a real, migrated, seeded Postgres database
// (DATABASE_URL should point at bncl_test — see BUILD_CHECKLIST.md Phase 1
// for the exact commands). It is the "automated tests that prove
// isolation" required by this project's governing instructions: two orgs
// exist in the seed (demo-org-a, demo-org-b), and every test below asserts
// Org A cannot read, edit, or delete Org B's data, and vice versa is not
// assumed safe just because it wasn't tested — the assertions are
// symmetric in spirit even though only A->B is exercised per case.

const ORG_A = "demo-org-a";
const ORG_B = "demo-org-b";

afterAll(async () => {
  await rawPrisma.$disconnect();
});

describe("scoped data-access layer: cross-tenant isolation", () => {
  it("Org A cannot READ Org B's Site by id (findUnique)", async () => {
    const orgBSite = await rawPrisma.site.findFirstOrThrow({ where: { orgId: ORG_B } });
    const result = await scopedDb(ORG_A).site.findUnique({ where: { id: orgBSite.id } });
    expect(result).toBeNull();
  });

  it("Org A cannot READ Org B's Users, even when explicitly requesting orgId=B in the where clause (findMany)", async () => {
    // The where clause asks for orgId=B (simulating a spoofed/buggy caller);
    // scopedDb must override it with the caller's real org rather than
    // honoring the requested filter, so the result set is Org A's users,
    // and must contain zero Org B users.
    const results = await scopedDb(ORG_A).user.findMany({ where: { orgId: ORG_B } });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((u) => u.orgId === ORG_A)).toBe(true);
    expect(results.some((u) => u.email.includes("riverside-demo"))).toBe(false);
  });

  it("Org A cannot EDIT Org B's Site (update rejected, row left untouched)", async () => {
    const orgBSite = await rawPrisma.site.findFirstOrThrow({ where: { orgId: ORG_B } });
    await expect(
      scopedDb(ORG_A).site.update({
        where: { id: orgBSite.id },
        data: { name: "HACKED BY ORG A" },
      })
    ).rejects.toThrow();

    const stillIntact = await rawPrisma.site.findUniqueOrThrow({ where: { id: orgBSite.id } });
    expect(stillIntact.name).toBe(orgBSite.name);
  });

  it("Org A cannot DELETE Org B's Audit (delete rejected, row still exists)", async () => {
    const orgBAudit = await rawPrisma.audit.findFirstOrThrow({ where: { orgId: ORG_B } });
    await expect(
      scopedDb(ORG_A).audit.delete({ where: { id: orgBAudit.id } })
    ).rejects.toThrow();

    const stillExists = await rawPrisma.audit.findUnique({ where: { id: orgBAudit.id } });
    expect(stillExists).not.toBeNull();
  });

  it("Org A cannot spoof another org's id on CREATE — scopedDb always injects the caller's own orgId", async () => {
    const created = await scopedDb(ORG_A).site.create({
      data: {
        orgId: ORG_B, // attacker-supplied; must be overwritten
        name: "Spoofed site attempt",
      } as never,
    });

    expect(created.orgId).toBe(ORG_A);
    await rawPrisma.site.delete({ where: { id: created.id } });
  });

  it("sanity check: Org A's own data IS readable through scopedDb (isolation isn't just a blanket empty result)", async () => {
    const orgASite = await scopedDb(ORG_A).site.findFirst({ where: {} });
    expect(orgASite?.orgId).toBe(ORG_A);
  });

  it("symmetric check: Org B cannot read Org A's Incident", async () => {
    const orgAIncident = await rawPrisma.incident.findFirstOrThrow({ where: { orgId: ORG_A } });
    const result = await scopedDb(ORG_B).incident.findUnique({ where: { id: orgAIncident.id } });
    expect(result).toBeNull();
  });
});

describe("RBAC: RolePermission matrix", () => {
  it("STAFF cannot approve on Audits; OWNER can", async () => {
    const staffPerm = await getModulePermission("STAFF", "AUDITS");
    const ownerPerm = await getModulePermission("OWNER", "AUDITS");
    expect(staffPerm.canApprove).toBe(false);
    expect(ownerPerm.canApprove).toBe(true);
  });

  it("STAFF cannot view admin modules", async () => {
    const perm = await getModulePermission("STAFF", "ADMIN_USERS");
    expect(perm.canView).toBe(false);
  });

  it("BNCL_ADMIN has no implicit access to a client org's governance modules", async () => {
    const perm = await getModulePermission("BNCL_ADMIN", "AUDITS");
    expect(perm.canView).toBe(false);
  });
});

describe("BNCL super-admin path: the sole unscoped access point", () => {
  it("rejects a non-BNCL_ADMIN session (org Owner)", () => {
    const ownerSession: SessionUser = {
      id: "x",
      orgId: ORG_A,
      role: "OWNER",
      email: "owner@greenfield-demo.example",
    };
    expect(() => assertBnclAdmin(ownerSession)).toThrow(BnclAdminRequiredError);
  });

  it("rejects a non-BNCL_ADMIN session (Registered Manager)", () => {
    const managerSession: SessionUser = {
      id: "x",
      orgId: ORG_B,
      role: "REGISTERED_MANAGER",
      email: "manager@riverside-demo.example",
    };
    expect(() => assertBnclAdmin(managerSession)).toThrow(BnclAdminRequiredError);
  });

  it("accepts a BNCL_ADMIN session", () => {
    const adminSession: SessionUser = {
      id: "x",
      orgId: "bncl-internal-org",
      role: "BNCL_ADMIN",
      email: "admin@bncl-solutions.example",
    };
    expect(() => assertBnclAdmin(adminSession)).not.toThrow();
  });

  it("the underlying cross-org read capability the super-admin module relies on actually sees both orgs (proves the gate, not the absence of data)", async () => {
    const orgs = await rawPrisma.organisation.findMany({
      where: { id: { in: [ORG_A, ORG_B] } },
    });
    expect(orgs.map((o) => o.id).sort()).toEqual([ORG_A, ORG_B].sort());
  });
});
