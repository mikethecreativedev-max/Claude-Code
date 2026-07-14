import { z } from "zod";

import { scopedDb, scopedOrganisation } from "@/server/db/scoped-client";
import { requireModulePermission } from "@/server/rbac/permissions";

/**
 * Data Protection Centre (/dashboard/admin/data-protection): DPA status,
 * org-scoped JSON export, retention settings.
 */

export class OwnerOnlyActionError extends Error {
  constructor() {
    super("Only the organisation Owner can change retention settings.");
    this.name = "OwnerOnlyActionError";
  }
}

export async function getDpaStatus() {
  const session = await requireModulePermission("ADMIN_DATA_PROTECTION", "view");
  return scopedDb(session.orgId).dataProcessingAgreement.findMany({
    orderBy: { signedDate: "desc" },
    include: { signedBy: { select: { name: true, email: true } } },
  });
}

const retentionSchema = z.object({
  retentionPolicyMonths: z.number().int().min(1).max(120),
});

/** Retention settings, editable by OWNER only. */
export async function updateRetentionPolicy(input: unknown) {
  const { retentionPolicyMonths } = retentionSchema.parse(input);
  const session = await requireModulePermission("ADMIN_DATA_PROTECTION", "edit");
  if (session.role !== "OWNER") {
    throw new OwnerOnlyActionError();
  }

  return scopedOrganisation(session.orgId).update({ retentionPolicyMonths });
}

// ─────────────────────────────────────────────────────────────────────────
// Org-scoped JSON data export
// ─────────────────────────────────────────────────────────────────────────
//
// THIS IS A REAL CROSS-TENANT RISK: every exporter below MUST resolve data
// exclusively through scopedDb(orgId) / scopedOrganisation(orgId), and
// exportOrgData() MUST derive orgId only from the verified session, never
// from client input. See the explicit "Org A export contains zero Org B
// data" test in tests/phase7-admin-billing.test.ts.
//
// Registered as a keyed registry (not a hardcoded object literal) so later
// phases (Audits, Incidents, Risk Register, ...) can add their own
// exporters by calling registerOrgExporter() from their own module's
// top-level, without needing to edit this file and risk merge conflicts
// with parallel worktrees.

type Exporter = (orgId: string) => Promise<unknown>;

const exporters = new Map<string, Exporter>();

export function registerOrgExporter(name: string, fn: Exporter) {
  exporters.set(name, fn);
}

registerOrgExporter("organisation", async (orgId) => scopedOrganisation(orgId).get());
registerOrgExporter("sites", async (orgId) => scopedDb(orgId).site.findMany({ where: { deletedAt: null } }));
registerOrgExporter("users", async (orgId) =>
  scopedDb(orgId).user.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
  })
);
registerOrgExporter("dataProcessingAgreements", async (orgId) =>
  scopedDb(orgId).dataProcessingAgreement.findMany()
);

export async function exportOrgData() {
  const session = await requireModulePermission("ADMIN_DATA_PROTECTION", "view");

  const entries = await Promise.all(
    Array.from(exporters.entries()).map(async ([key, fn]) => [key, await fn(session.orgId)] as const)
  );

  return {
    exportedAt: new Date().toISOString(),
    orgId: session.orgId,
    data: Object.fromEntries(entries),
  };
}
