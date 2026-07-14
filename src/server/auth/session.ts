import { getServerSession } from "next-auth";

import { authOptions } from "@/server/auth/auth";

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export type SessionUser = {
  id: string;
  orgId: string;
  role: "OWNER" | "REGISTERED_MANAGER" | "STAFF" | "BNCL_ADMIN";
  email: string;
};

/**
 * Step 1 of the mandatory auth -> org -> RBAC check chain. Every route
 * handler and server action must call this (directly or via
 * requireModulePermission) before touching any data. Never trust an
 * org/user id supplied by the client — orgId always comes from here.
 */
export async function requireAuth(): Promise<SessionUser> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.orgId || !session.user.role) {
    throw new UnauthorizedError();
  }
  return {
    id: session.user.id,
    orgId: session.user.orgId,
    role: session.user.role as SessionUser["role"],
    email: session.user.email ?? "",
  };
}

export class OrgMismatchError extends Error {
  constructor() {
    super("Requested resource does not belong to the caller's organisation");
    this.name = "OrgMismatchError";
  }
}

/**
 * Step 2 of the chain. Use whenever a request carries an org-identifying
 * value from the client (e.g. an invite-acceptance flow, an org id in a
 * URL) that must be reconciled against the session before proceeding. Most
 * routes don't need this explicitly because they only ever operate on the
 * session's own orgId (scopedDb enforces that at the data layer) — call
 * this specifically when client input claims to reference an org.
 */
export function requireOrgMatch(session: SessionUser, requestedOrgId: string) {
  if (session.orgId !== requestedOrgId) {
    throw new OrgMismatchError();
  }
}
