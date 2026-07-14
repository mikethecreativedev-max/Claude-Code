import crypto from "crypto";

import bcrypt from "bcryptjs";

import { rawPrisma } from "@/server/db/prisma";
import { scopedDb } from "@/server/db/scoped-client";
import { requireModulePermission } from "@/server/rbac/permissions";
import {
  acceptInviteSchema,
  inviteSchema,
  type InviteInput,
  type InviteRole,
} from "@/server/onboarding/schemas";

/**
 * INVITE FLOW — token design decision (documented per the task's ask to
 * "document the choice"):
 *
 * The invited User row is created immediately, at invite time, with
 * status INVITED and the org/role the inviter chose. This is the single
 * source of truth for which org/role the invitee joins — the accept flow
 * never lets the invitee choose or override either, it only ever reads
 * them off this already-created row.
 *
 * Rather than adding a new model, we reuse the NextAuth-adapter
 * VerificationToken model (identifier/token/expires) that already exists
 * in schema.prisma, with a lightweight convention on top: identifier is
 * `invite:<userId>`, token is the SHA-256 hash of a random 32-byte value
 * (the raw value is what's embedded in the accept link — only the hash is
 * stored, matching how NextAuth itself handles magic-link tokens). This
 * avoids a schema change while giving invites their own token space,
 * separate from magic-link sign-in tokens (whose identifier is a bare
 * email).
 *
 * VerificationToken carries no orgId and is not in scoped-client.ts's
 * TENANT_MODELS set (same category as RolePermission) — reading/writing it
 * directly via rawPrisma here is not a tenant-isolation violation, but is
 * still routed through this allowlisted module (not scattered across route
 * handlers) for import-discipline consistency. Accepting an invite is,
 * like Credentials login in auth.ts, inherently pre-session: the caller
 * has only a token and a user id, not an org to scope by yet, so the User
 * lookup by id also goes through rawPrisma here (mirroring auth.ts's email
 * lookup) — the actual mutation (status/password update) then goes
 * through scopedDb(user.orgId) once the org is known.
 */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class InviteTokenInvalidError extends Error {
  constructor() {
    super("This invite link is invalid or has expired");
    this.name = "InviteTokenInvalidError";
  }
}

export class EmailAlreadyInUseError extends Error {
  constructor() {
    super("An account with that email already exists");
    this.name = "EmailAlreadyInUseError";
  }
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function tokenIdentifier(userId: string) {
  return `invite:${userId}`;
}

export type CreateInviteResult = {
  userId: string;
  email: string;
  role: InviteRole;
  acceptUrl: string;
};

/**
 * Core invite-creation logic, already authorized — takes orgId and the
 * inviting user's id directly rather than re-deriving them, so it is
 * testable against a real database without a live NextAuth session (see
 * tests/phase2-onboarding-dashboard.test.ts). The public entry point below
 * (inviteUser) is what route handlers call; it does the RBAC gate first.
 */
export async function createInviteForOrg(
  orgId: string,
  actingUserId: string,
  input: InviteInput
): Promise<CreateInviteResult> {
  const existing = await rawPrisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new EmailAlreadyInUseError();
  }

  const db = scopedDb(orgId);
  const invited = await db.user.create({
    data: {
      orgId,
      name: input.name,
      email: input.email,
      role: input.role,
      status: "INVITED",
    },
  });

  await db.auditLogEntry.create({
    data: {
      orgId,
      entityType: "USER",
      entityId: invited.id,
      userId: actingUserId,
      action: "INVITE",
      afterSnapshot: { email: invited.email, role: invited.role, status: invited.status },
    },
  });

  const rawToken = crypto.randomBytes(32).toString("hex");
  await rawPrisma.verificationToken.create({
    data: {
      identifier: tokenIdentifier(invited.id),
      token: hashToken(rawToken),
      expires: new Date(Date.now() + INVITE_TTL_MS),
    },
  });

  return {
    userId: invited.id,
    email: invited.email,
    role: invited.role as InviteRole,
    acceptUrl: `/invite/accept?uid=${invited.id}&token=${rawToken}`,
  };
}

/**
 * Public entry point for POST /api/invites. Auth -> org -> RBAC: gated by
 * requireModulePermission("ADMIN_USERS", "edit") — orgId comes only from
 * the authenticated session, never from the request body.
 */
export async function inviteUser(input: unknown): Promise<CreateInviteResult> {
  const session = await requireModulePermission("ADMIN_USERS", "edit");
  const parsed = inviteSchema.parse(input);
  return createInviteForOrg(session.orgId, session.id, parsed);
}

export type OrgUserListItem = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: Date;
};

/**
 * Public entry point for GET /api/invites (the invite screen's team list).
 * Auth -> org -> RBAC: gated by requireModulePermission("ADMIN_USERS", "view").
 */
export async function listOrgUsers(): Promise<OrgUserListItem[]> {
  const session = await requireModulePermission("ADMIN_USERS", "view");
  const db = scopedDb(session.orgId);
  return db.user.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
  });
}

export type InviteDetails = { email: string; name: string; role: string; orgName: string };

/**
 * Pre-auth lookup: resolves an invite token to the invited user's org/role
 * for display on the accept page, without creating a session and without
 * trusting any org/role claim from the client — the only client input is
 * the opaque token + user id; org and role are read off the User row that
 * an authenticated admin already created at invite time.
 */
export async function getInviteDetails(uid: string, token: string): Promise<InviteDetails> {
  if (!uid || !token) throw new InviteTokenInvalidError();

  const record = await rawPrisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: tokenIdentifier(uid), token: hashToken(token) } },
  });
  if (!record || record.expires < new Date()) {
    throw new InviteTokenInvalidError();
  }

  const user = await rawPrisma.user.findUnique({
    where: { id: uid },
    include: { organisation: true },
  });
  if (!user || user.status !== "INVITED") {
    throw new InviteTokenInvalidError();
  }

  return { email: user.email, name: user.name, role: user.role, orgName: user.organisation.name };
}

/**
 * Redeems an invite token: sets a password, flips status to ACTIVE. Never
 * accepts an org or role from the client — both come from the User row
 * created at invite time, resolved purely from the token.
 */
export async function acceptInvite(input: unknown): Promise<{ email: string }> {
  const parsed = acceptInviteSchema.parse(input);

  const record = await rawPrisma.verificationToken.findUnique({
    where: {
      identifier_token: { identifier: tokenIdentifier(parsed.uid), token: hashToken(parsed.token) },
    },
  });
  if (!record || record.expires < new Date()) {
    throw new InviteTokenInvalidError();
  }

  const user = await rawPrisma.user.findUnique({ where: { id: parsed.uid } });
  if (!user || user.status !== "INVITED") {
    throw new InviteTokenInvalidError();
  }

  const passwordHash = await bcrypt.hash(parsed.password, 10);
  const db = scopedDb(user.orgId);

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash, status: "ACTIVE", emailVerified: new Date() },
  });

  await db.auditLogEntry.create({
    data: {
      orgId: user.orgId,
      entityType: "USER",
      entityId: user.id,
      userId: user.id,
      action: "UPDATE",
      beforeSnapshot: { status: "INVITED" },
      afterSnapshot: { status: "ACTIVE" },
    },
  });

  // Single-use: delete the token once redeemed.
  await rawPrisma.verificationToken.delete({
    where: { identifier_token: { identifier: record.identifier, token: record.token } },
  });

  return { email: user.email };
}
