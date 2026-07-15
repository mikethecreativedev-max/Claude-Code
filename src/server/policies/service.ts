import type { Prisma, Policy } from "@prisma/client";

import { scopedDb } from "@/server/db/scoped-client";
import type { SessionUser } from "@/server/auth/session";
import { writeAuditLog } from "@/server/domain/audit-log";
import { walkVersionChain } from "@/server/domain/version-chain";
import { policyInputSchema, type PolicyInput } from "@/server/policies/schema";

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export class PolicyNotFoundError extends Error {
  constructor(id: string) {
    super(`Policy "${id}" not found (or not the current version) in the caller's organisation`);
    this.name = "PolicyNotFoundError";
  }
}

export async function listCurrentPolicies(orgId: string, siteId?: string) {
  const db = scopedDb(orgId);
  return db.policy.findMany({
    where: {
      isCurrentVersion: true,
      deletedAt: null,
      ...(siteId ? { siteId } : {}),
    },
    include: { site: true },
    orderBy: [{ reviewDate: "asc" }],
  });
}

export async function getPolicyDetail(orgId: string, id: string) {
  const db = scopedDb(orgId);
  return db.policy.findFirst({ where: { id, isCurrentVersion: true }, include: { site: true } });
}

/** getVersionChain(orgId, currentId) — walks the supersededById chain
 * backwards for a Policy, newest (current) first. */
export async function getPolicyVersionChain(orgId: string, currentId: string) {
  const db = scopedDb(orgId);
  const current = await db.policy.findUnique({ where: { id: currentId } });
  if (!current) return null;
  return walkVersionChain(current, (id) => db.policy.findFirst({ where: { supersededById: id } }));
}

export async function createPolicy(session: SessionUser, rawInput: unknown) {
  const input: PolicyInput = policyInputSchema.parse(rawInput);
  const db = scopedDb(session.orgId);

  const created = await db.policy.create({
    data: {
      // orgId is explicit here purely to satisfy Prisma's generated
      // UncheckedCreateInput type (a required scalar column) — scopedDb's
      // tenant-scope extension unconditionally overwrites this with the
      // caller's real session-derived orgId at runtime regardless of what
      // is passed here (see scoped-client.ts's `data: { ...data, orgId }`),
      // so this can never be used to spoof another org.
      orgId: session.orgId,
      siteId: input.siteId,
      title: input.title,
      reviewDate: new Date(input.reviewDate),
      status: input.status,
      versionNumber: 1,
      isCurrentVersion: true,
    },
  });

  await writeAuditLog(db, {
    entityType: "POLICY",
    entityId: created.id,
    userId: session.id,
    action: "CREATE",
    beforeSnapshot: null,
    afterSnapshot: toJson(created),
  });

  return created;
}

/**
 * "Edit" per the append-only versioning pattern — same shape as
 * RiskEntry's editRiskEntry: new row + old row's supersededById/
 * isCurrentVersion flip, plus a real AuditLogEntry.
 *
 * Uses an INTERACTIVE transaction (db.$transaction(async (tx) => ...)),
 * not the array form, because the supersededById write on the old row
 * depends on the new row's generated id — the array form can't express
 * that dependency, and running that write as a separate statement after
 * an array-transaction commits (as an earlier version of this function
 * did) leaves a real gap where a crash between the two could strand the
 * old row with isCurrentVersion=false and supersededById=null, breaking
 * the version chain. See src/server/risks/service.ts's editRiskEntry for
 * the identical pattern.
 */
export async function editPolicy(session: SessionUser, id: string, rawInput: unknown) {
  const input: PolicyInput = policyInputSchema.parse(rawInput);
  const db = scopedDb(session.orgId);

  const previous = await db.policy.findFirst({ where: { id, isCurrentVersion: true } });
  if (!previous) {
    throw new PolicyNotFoundError(id);
  }

  const created = await db.$transaction(async (tx) => {
    await tx.policy.update({ where: { id: previous.id }, data: { isCurrentVersion: false } });
    const newVersion = await tx.policy.create({
      data: {
        // See createPolicy's comment: explicit only to satisfy the
        // generated type; scopedDb always overwrites this at runtime.
        orgId: session.orgId,
        siteId: input.siteId,
        title: input.title,
        reviewDate: new Date(input.reviewDate),
        status: input.status,
        versionNumber: previous.versionNumber + 1,
        isCurrentVersion: true,
      },
    });
    await tx.policy.update({ where: { id: previous.id }, data: { supersededById: newVersion.id } });
    return newVersion;
  });

  await writeAuditLog(db, {
    entityType: "POLICY",
    entityId: created.id,
    userId: session.id,
    action: "UPDATE",
    beforeSnapshot: toJson(previous),
    afterSnapshot: toJson(created),
  });

  return created;
}

/**
 * Approve-level action: "activating a policy" (e.g. moving it out of
 * UNDER_REVIEW into ACTIVE, or any other approved status transition).
 * Status is a business field -> new version, not an in-place update.
 * Callers must have already checked
 * requireModulePermission('POLICIES', 'approve').
 */
export async function activatePolicy(session: SessionUser, id: string, newStatus: Policy["status"]) {
  const db = scopedDb(session.orgId);
  const previous = await db.policy.findFirst({ where: { id, isCurrentVersion: true } });
  if (!previous) {
    throw new PolicyNotFoundError(id);
  }

  // See editPolicy's comment: single interactive transaction, not an
  // array-transaction plus a trailing update.
  const created = await db.$transaction(async (tx) => {
    await tx.policy.update({ where: { id: previous.id }, data: { isCurrentVersion: false } });
    const newVersion = await tx.policy.create({
      data: {
        // See createPolicy's comment: explicit only to satisfy the
        // generated type; scopedDb always overwrites this at runtime.
        orgId: session.orgId,
        siteId: previous.siteId,
        title: previous.title,
        reviewDate: previous.reviewDate,
        status: newStatus,
        versionNumber: previous.versionNumber + 1,
        isCurrentVersion: true,
      },
    });
    await tx.policy.update({ where: { id: previous.id }, data: { supersededById: newVersion.id } });
    return newVersion;
  });

  await writeAuditLog(db, {
    entityType: "POLICY",
    entityId: created.id,
    userId: session.id,
    action: "APPROVE",
    beforeSnapshot: toJson(previous),
    afterSnapshot: toJson(created),
  });

  return created;
}

/** Void (soft-delete) — same rationale as voidRiskEntry: deletedAt is a
 * lifecycle marker, set via direct update, not a new version. */
export async function voidPolicy(session: SessionUser, id: string) {
  const db = scopedDb(session.orgId);
  const previous = await db.policy.findFirst({ where: { id, isCurrentVersion: true } });
  if (!previous) {
    throw new PolicyNotFoundError(id);
  }

  const updated = await db.policy.update({
    where: { id: previous.id },
    data: { deletedAt: new Date() },
  });

  await writeAuditLog(db, {
    entityType: "POLICY",
    entityId: updated.id,
    userId: session.id,
    action: "DELETE",
    beforeSnapshot: toJson(previous),
    afterSnapshot: toJson(updated),
  });

  return updated;
}

export type PolicyReviewStatus = "OVERDUE" | "DUE_SOON" | "OK";

const DUE_SOON_WINDOW_DAYS = 30;

export function derivePolicyReviewStatus(reviewDate: Date, now = new Date()): PolicyReviewStatus {
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntilDue = (reviewDate.getTime() - now.getTime()) / msPerDay;
  if (daysUntilDue < 0) return "OVERDUE";
  if (daysUntilDue <= DUE_SOON_WINDOW_DAYS) return "DUE_SOON";
  return "OK";
}

/** Review-date tracker: current-version policies annotated with derived status. */
export async function getPolicyReviewTracker(orgId: string, siteId?: string) {
  const policies = await listCurrentPolicies(orgId, siteId);
  return policies
    .map((p) => ({ ...p, reviewStatus: derivePolicyReviewStatus(p.reviewDate) }))
    .sort((a, b) => a.reviewDate.getTime() - b.reviewDate.getTime());
}
