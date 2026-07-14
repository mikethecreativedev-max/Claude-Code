import type { ModuleName } from "@prisma/client";

import { rawPrisma } from "@/server/db/prisma";
import { requireAuth, type SessionUser } from "@/server/auth/session";

// RolePermission is a global reference table (identical across every
// tenant by design — see prisma/schema.prisma), so reading it via
// rawPrisma here is not a tenant-isolation violation: it carries no orgId
// and is not in scoped-client.ts's TENANT_MODELS set. This file is not in
// the allowlist in scripts/check-tenant-isolation-imports.js on purpose —
// if RolePermission ever becomes tenant-scoped, that script's failure is
// what should force this file to be reworked through scopedDb().
export type PermissionLevel = "view" | "edit" | "approve";

export class ForbiddenError extends Error {
  constructor(module: ModuleName, level: PermissionLevel) {
    super(`Role lacks "${level}" permission on module "${module}"`);
    this.name = "ForbiddenError";
  }
}

export async function getModulePermission(role: SessionUser["role"], module: ModuleName) {
  const perm = await rawPrisma.rolePermission.findUnique({
    where: { role_module: { role, module } },
  });
  return perm ?? { canView: false, canEdit: false, canApprove: false };
}

/**
 * Step 3 of the mandatory auth -> org -> RBAC check chain, and the
 * standard entry point route handlers/server actions should call. Runs
 * requireAuth() (step 1) internally, then checks the RolePermission table
 * (step 3) server-side. "Org check" (step 2) is implicit here: orgId is
 * taken only from the verified session, never from client input, which is
 * what scopedDb() will enforce again at the data layer.
 */
export async function requireModulePermission(
  module: ModuleName,
  level: PermissionLevel
): Promise<SessionUser> {
  const session = await requireAuth();
  const perm = await getModulePermission(session.role, module);
  const allowed =
    level === "view" ? perm.canView : level === "edit" ? perm.canEdit : perm.canApprove;
  if (!allowed) {
    throw new ForbiddenError(module, level);
  }
  return session;
}
