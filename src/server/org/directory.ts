import type { ScopedDb } from "@/server/db/scoped-client";

/**
 * Small shared read helpers used by several Phase 5 modules' forms
 * (site/user pickers). All go through the caller's scopedDb — never
 * rawPrisma — so they inherit the same tenant-isolation guarantee as
 * everything else.
 */

export async function listOrgSites(db: ScopedDb) {
  return db.site.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function listOrgUsers(db: ScopedDb) {
  return db.user.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true },
  });
}

/** Site ids the given user is assigned to, via UserSite, scoped to this
 * caller's own org (User is a TENANT_MODEL so this findUnique is
 * org-scoped automatically; UserSite itself carries no orgId — see
 * scoped-client.ts NO_DIRECT_ORG_ID comment — but it can only be reached
 * here through a User row that scopedDb already proved belongs to the
 * caller's org). */
export async function listUserSiteIds(db: ScopedDb, userId: string): Promise<string[]> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { userSites: { select: { siteId: true } } },
  });
  return user?.userSites.map((us) => us.siteId) ?? [];
}
