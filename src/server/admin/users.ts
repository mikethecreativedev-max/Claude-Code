import { z } from "zod";
import type { UserRole } from "@prisma/client";

import { scopedDb } from "@/server/db/scoped-client";
import { requireModulePermission } from "@/server/rbac/permissions";
import type { SessionUser } from "@/server/auth/session";

/**
 * User & role management for a client org (/dashboard/admin/users).
 *
 * Every exported function here re-checks RBAC server-side via
 * requireModulePermission("ADMIN_USERS", ...) — the UI hiding a button is
 * never trusted. Role assignment additionally requires "approve", not just
 * "edit": per the seeded RolePermission matrix, only OWNER has canApprove
 * on ADMIN_USERS (REGISTERED_MANAGER has canEdit but not canApprove, STAFF
 * has neither). This is what actually stops a STAFF or REGISTERED_MANAGER
 * session from granting itself (or anyone) OWNER — see
 * tests/phase7-admin-billing.test.ts.
 *
 * All org data access goes through scopedDb(session.orgId) — a target
 * userId belonging to a different org simply won't be found/updated,
 * because scopedDb injects the caller's own orgId into every where clause.
 */

export class SelfDemotionBlockedError extends Error {
  constructor() {
    super("You cannot change your own role or disable your own account.");
    this.name = "SelfDemotionBlockedError";
  }
}

const INVITABLE_ROLES = ["OWNER", "REGISTERED_MANAGER", "STAFF"] as const;
type InvitableRole = (typeof INVITABLE_ROLES)[number];

const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(200),
  role: z.enum(INVITABLE_ROLES),
});

const changeRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(INVITABLE_ROLES),
});

const disableUserSchema = z.object({
  userId: z.string().min(1),
});

/**
 * Requires "edit"; if the target role is OWNER, additionally requires
 * "approve". Throws ForbiddenError (from requireModulePermission) if either
 * check fails.
 */
async function requireRoleGrantPermission(role: InvitableRole): Promise<SessionUser> {
  const session = await requireModulePermission("ADMIN_USERS", "edit");
  if (role === "OWNER") {
    await requireModulePermission("ADMIN_USERS", "approve");
  }
  return session;
}

export async function listUsers() {
  const session = await requireModulePermission("ADMIN_USERS", "view");
  return scopedDb(session.orgId).user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Minimal invite: creates a User row with status INVITED via scopedDb. No
 * token/email-send flow — that's Phase 2's job (see BUILD_CHECKLIST.md).
 * This just needs the admin-side action to exist and be correctly RBAC'd.
 */
export async function inviteUser(input: unknown) {
  const { email, name, role } = inviteUserSchema.parse(input);
  const session = await requireRoleGrantPermission(role);

  // `data` intentionally omits orgId — scopedDb() injects it at runtime.
  // See the matching comment in src/server/admin/sites.ts createSite() for
  // why the `as never` cast is needed here and is consistent with this
  // codebase's established pattern (scoped-client.ts and
  // tests/tenant-isolation.test.ts both do the same at their create() call
  // sites), not a general `any`-style bypass.
  return scopedDb(session.orgId).user.create({
    data: {
      email,
      name,
      role: role as UserRole,
      status: "INVITED",
    },
  } as never);
}

export async function changeUserRole(input: unknown) {
  const { userId, role } = changeRoleSchema.parse(input);
  const session = await requireRoleGrantPermission(role);

  if (userId === session.id) {
    throw new SelfDemotionBlockedError();
  }

  return scopedDb(session.orgId).user.update({
    where: { id: userId },
    data: { role: role as UserRole },
  });
}

/** Soft-disable: sets status DISABLED. Never a hard delete. */
export async function disableUser(input: unknown) {
  const { userId } = disableUserSchema.parse(input);
  const session = await requireModulePermission("ADMIN_USERS", "edit");

  if (userId === session.id) {
    throw new SelfDemotionBlockedError();
  }

  return scopedDb(session.orgId).user.update({
    where: { id: userId },
    data: { status: "DISABLED" },
  });
}

/** Re-activate a previously disabled or invited user. Same "edit" gate as disable. */
export async function reactivateUser(input: unknown) {
  const { userId } = disableUserSchema.parse(input);
  const session = await requireModulePermission("ADMIN_USERS", "edit");

  return scopedDb(session.orgId).user.update({
    where: { id: userId },
    data: { status: "ACTIVE" },
  });
}
