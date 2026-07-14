import { z } from "zod";
import type { UserRole } from "@prisma/client";

import { scopedDb } from "@/server/db/scoped-client";
import { requireModulePermission } from "@/server/rbac/permissions";
import type { SessionUser } from "@/server/auth/session";

// Inviting new users lives in src/server/onboarding/invite.ts (Phase 2) —
// it's the token-based flow with an accept page, which supersedes the
// minimal no-token invite this module used to have. This module owns
// managing *existing* users (role changes, disable/reactivate).

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

export const INVITABLE_ROLES = ["OWNER", "REGISTERED_MANAGER", "STAFF"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

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
 *
 * Note: src/server/onboarding/invite.ts (Phase 2's invite flow) doesn't
 * need this — its INVITE_ROLES enum (schemas.ts) only permits inviting
 * REGISTERED_MANAGER or STAFF in the first place, so granting OWNER via
 * invite is impossible by construction, not by a runtime permission check.
 * OWNER can only ever be reached via changeUserRole() below.
 */
export async function requireRoleGrantPermission(role: InvitableRole): Promise<SessionUser> {
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
