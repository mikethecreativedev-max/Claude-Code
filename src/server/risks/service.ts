import type { Prisma, RiskEntry } from "@prisma/client";

import { scopedDb } from "@/server/db/scoped-client";
import type { SessionUser } from "@/server/auth/session";
import { writeAuditLog } from "@/server/domain/audit-log";
import { walkVersionChain } from "@/server/domain/version-chain";
import { riskEntryInputSchema, type RiskEntryInput } from "@/server/risks/schema";

/**
 * The single source of truth for `riskRating`. Called server-side only —
 * never trust a client-supplied riskRating even if one is present in the
 * input payload (see schema.ts's comment on `riskEntryInputSchema`).
 */
export function computeRiskRating(likelihood: number, impact: number): number {
  return likelihood * impact;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export class RiskEntryNotFoundError extends Error {
  constructor(id: string) {
    super(`RiskEntry "${id}" not found (or not the current version) in the caller's organisation`);
    this.name = "RiskEntryNotFoundError";
  }
}

export async function listCurrentRiskEntries(orgId: string, siteId?: string) {
  const db = scopedDb(orgId);
  return db.riskEntry.findMany({
    where: {
      isCurrentVersion: true,
      deletedAt: null,
      ...(siteId ? { siteId } : {}),
    },
    include: { site: true, owner: true },
    orderBy: [{ riskRating: "desc" }, { updatedAt: "desc" }],
  });
}

export async function getRiskEntryDetail(orgId: string, id: string) {
  const db = scopedDb(orgId);
  const entry = await db.riskEntry.findFirst({
    where: { id, isCurrentVersion: true },
    include: { site: true, owner: true },
  });
  return entry;
}

/** getVersionChain(orgId, currentId) — walks the supersededById chain
 * backwards for a RiskEntry, newest (current) first. */
export async function getRiskEntryVersionChain(orgId: string, currentId: string) {
  const db = scopedDb(orgId);
  const current = await db.riskEntry.findUnique({ where: { id: currentId } });
  if (!current) return null;
  return walkVersionChain(current, (id) =>
    db.riskEntry.findFirst({ where: { supersededById: id } })
  );
}

export async function createRiskEntry(session: SessionUser, rawInput: unknown) {
  const input = riskEntryInputSchema.parse(rawInput);
  const db = scopedDb(session.orgId);

  const riskRating = computeRiskRating(input.likelihood, input.impact);

  const created = await db.riskEntry.create({
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
      description: input.description,
      likelihood: input.likelihood,
      impact: input.impact,
      riskRating, // server-computed, never input.riskRating
      ownerId: input.ownerId,
      mitigationActions: toJson(input.mitigationActions),
      reviewDate: new Date(input.reviewDate),
      status: input.status,
      versionNumber: 1,
      isCurrentVersion: true,
    },
  });

  await writeAuditLog(db, {
    entityType: "RISK_ENTRY",
    entityId: created.id,
    userId: session.id,
    action: "CREATE",
    beforeSnapshot: null,
    afterSnapshot: toJson(created),
  });

  return created;
}

/**
 * "Edit" per the append-only versioning pattern: create a new row
 * (versionNumber + 1, isCurrentVersion true), then flip the OLD row to
 * supersededById = new row's id, isCurrentVersion = false — all inside a
 * single INTERACTIVE transaction (db.$transaction(async (tx) => ...))
 * rather than the array form, because the third write (setting
 * supersededById on the old row) depends on the new row's generated id.
 * The array form of $transaction can't express that dependency, so an
 * earlier version of this function ran that third write as a separate
 * statement AFTER the array-transaction committed — which left a real gap:
 * a crash/error between the transaction and that follow-up update would
 * leave the old row with isCurrentVersion=false and supersededById=null,
 * an unrecoverable break in the version chain. The interactive transaction
 * below keeps all three writes atomic.
 */
export async function editRiskEntry(session: SessionUser, id: string, rawInput: unknown) {
  const input: RiskEntryInput = riskEntryInputSchema.parse(rawInput);
  const db = scopedDb(session.orgId);

  const previous = await db.riskEntry.findFirst({ where: { id, isCurrentVersion: true } });
  if (!previous) {
    throw new RiskEntryNotFoundError(id);
  }

  const riskRating = computeRiskRating(input.likelihood, input.impact);

  const created = await db.$transaction(async (tx) => {
    await tx.riskEntry.update({
      where: { id: previous.id },
      data: { isCurrentVersion: false },
    });
    const newVersion = await tx.riskEntry.create({
      data: {
        // See createRiskEntry's comment: explicit only to satisfy the
        // generated type; scopedDb always overwrites this at runtime.
        orgId: session.orgId,
        siteId: input.siteId,
        title: input.title,
        description: input.description,
        likelihood: input.likelihood,
        impact: input.impact,
        riskRating,
        ownerId: input.ownerId,
        mitigationActions: toJson(input.mitigationActions),
        reviewDate: new Date(input.reviewDate),
        status: input.status,
        versionNumber: previous.versionNumber + 1,
        isCurrentVersion: true,
      },
    });
    await tx.riskEntry.update({
      where: { id: previous.id },
      data: { supersededById: newVersion.id },
    });
    return newVersion;
  });

  await writeAuditLog(db, {
    entityType: "RISK_ENTRY",
    entityId: created.id,
    userId: session.id,
    action: "UPDATE",
    beforeSnapshot: toJson(previous),
    afterSnapshot: toJson(created),
  });

  return created;
}

/**
 * Approve-level status transition (e.g. signing off a mitigation plan).
 * Status is a business field, so this follows the same append-only
 * versioning pattern as a full edit — it is not an in-place UPDATE of the
 * current row. Callers must have already checked
 * requireModulePermission('RISK_REGISTER', 'approve').
 */
export async function approveRiskEntry(session: SessionUser, id: string, newStatus: RiskEntry["status"]) {
  const db = scopedDb(session.orgId);
  const previous = await db.riskEntry.findFirst({ where: { id, isCurrentVersion: true } });
  if (!previous) {
    throw new RiskEntryNotFoundError(id);
  }

  // See editRiskEntry's comment: this must be a single interactive
  // transaction, not an array-transaction plus a trailing update, so the
  // version chain can never be observed (or left, on failure) half-updated.
  const created = await db.$transaction(async (tx) => {
    await tx.riskEntry.update({ where: { id: previous.id }, data: { isCurrentVersion: false } });
    const newVersion = await tx.riskEntry.create({
      data: {
        // See createRiskEntry's comment: explicit only to satisfy the
        // generated type; scopedDb always overwrites this at runtime.
        orgId: session.orgId,
        siteId: previous.siteId,
        title: previous.title,
        description: previous.description,
        likelihood: previous.likelihood,
        impact: previous.impact,
        riskRating: previous.riskRating,
        ownerId: previous.ownerId,
        mitigationActions: previous.mitigationActions as Prisma.InputJsonValue,
        reviewDate: previous.reviewDate,
        status: newStatus,
        versionNumber: previous.versionNumber + 1,
        isCurrentVersion: true,
      },
    });
    await tx.riskEntry.update({ where: { id: previous.id }, data: { supersededById: newVersion.id } });
    return newVersion;
  });

  await writeAuditLog(db, {
    entityType: "RISK_ENTRY",
    entityId: created.id,
    userId: session.id,
    action: "APPROVE",
    beforeSnapshot: toJson(previous),
    afterSnapshot: toJson(created),
  });

  return created;
}

/**
 * Void (soft-delete). Unlike a business-field edit, deletedAt is a
 * lifecycle marker, not versioned content — so this sets it via a direct
 * update on the current row rather than minting a new version. Still
 * writes a full AuditLogEntry (action DELETE) with real before/after
 * snapshots.
 */
export async function voidRiskEntry(session: SessionUser, id: string) {
  const db = scopedDb(session.orgId);
  const previous = await db.riskEntry.findFirst({ where: { id, isCurrentVersion: true } });
  if (!previous) {
    throw new RiskEntryNotFoundError(id);
  }

  const updated = await db.riskEntry.update({
    where: { id: previous.id },
    data: { deletedAt: new Date() },
  });

  await writeAuditLog(db, {
    entityType: "RISK_ENTRY",
    entityId: updated.id,
    userId: session.id,
    action: "DELETE",
    beforeSnapshot: toJson(previous),
    afterSnapshot: toJson(updated),
  });

  return updated;
}

/** Likelihood (1-5) x impact (1-5) grid of current-version, org-scoped RiskEntry rows. */
export async function getRiskMatrix(orgId: string, siteId?: string) {
  const entries = await listCurrentRiskEntries(orgId, siteId);
  const grid: (typeof entries)[number][][][] = Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => [])
  );
  for (const entry of entries) {
    const l = Math.min(Math.max(entry.likelihood, 1), 5) - 1;
    const i = Math.min(Math.max(entry.impact, 1), 5) - 1;
    // Safe: l and i are always in [0, 4] after the clamp above, matching
    // the fixed 5x5 grid built above (noUncheckedIndexedAccess makes TS
    // otherwise treat these as possibly-undefined).
    grid[l]![i]!.push(entry);
  }
  return grid;
}
