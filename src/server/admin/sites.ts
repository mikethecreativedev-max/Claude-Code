import { z } from "zod";

import { scopedDb } from "@/server/db/scoped-client";
import { requireModulePermission } from "@/server/rbac/permissions";

/**
 * Site management for multi-site orgs (/dashboard/admin/sites). All access
 * scoped via scopedDb(session.orgId) — a siteId belonging to another org
 * simply won't be found/updated.
 */

const createSiteSchema = z.object({
  name: z.string().trim().min(1).max(300),
  address: z.string().trim().max(500).optional(),
  registeredActivities: z.array(z.string().trim().min(1)).default([]),
  cqcLocationId: z.string().trim().max(100).optional(),
});

const updateSiteSchema = z.object({
  siteId: z.string().min(1),
  name: z.string().trim().min(1).max(300).optional(),
  address: z.string().trim().max(500).optional(),
  registeredActivities: z.array(z.string().trim().min(1)).optional(),
  cqcLocationId: z.string().trim().max(100).optional(),
});

export async function listSites() {
  const session = await requireModulePermission("ADMIN_SITES", "view");
  return scopedDb(session.orgId).site.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
}

export async function createSite(input: unknown) {
  const data = createSiteSchema.parse(input);
  const session = await requireModulePermission("ADMIN_SITES", "edit");

  // `data` intentionally omits orgId — scopedDb() injects it at runtime
  // (see src/server/db/scoped-client.ts). Prisma's generated CreateInput
  // type still requires orgId/organisation statically, since the client
  // extension doesn't change the exposed argument type; the `as never`
  // escape hatch here mirrors the one scoped-client.ts documents for
  // itself and the one tests/tenant-isolation.test.ts already uses at its
  // own create() call site — it is not a general `any`-style bypass.
  return scopedDb(session.orgId).site.create({ data } as never);
}

export async function updateSite(input: unknown) {
  const { siteId, ...data } = updateSiteSchema.parse(input);
  const session = await requireModulePermission("ADMIN_SITES", "edit");

  return scopedDb(session.orgId).site.update({
    where: { id: siteId },
    data,
  });
}
