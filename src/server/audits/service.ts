import type { Prisma } from "@prisma/client";

import { scopedDb } from "@/server/db/scoped-client";
import type { SessionUser } from "@/server/auth/session";
import { requirePaidTier } from "@/server/rbac/tier-check";
import { writeAuditLog } from "@/server/governance/audit-log";
import { walkVersionChain } from "@/server/governance/version-chain";
import { verifyOwnedEntity, assertOwnedEntity } from "@/server/governance/tagging";
import {
  type CreateAuditInput,
  type EditAuditInput,
  type CompleteAuditInput,
} from "@/server/audits/schemas";

export class AuditNotFoundError extends Error {
  constructor(id: string) {
    super(`No Audit with id "${id}" exists in your organisation`);
    this.name = "AuditNotFoundError";
  }
}

export class SuperseededVersionError extends Error {
  constructor() {
    super("This is a superseded version of the audit; edit the current version instead");
    this.name = "SuperseededVersionError";
  }
}

async function requireCurrentAudit(orgId: string, id: string) {
  const audit = await scopedDb(orgId).audit.findUnique({ where: { id } });
  if (!audit) throw new AuditNotFoundError(id);
  if (!audit.isCurrentVersion) throw new SuperseededVersionError();
  return audit;
}

// ── List / read ────────────────────────────────────────────────────────

export async function listCurrentAudits(
  session: SessionUser,
  opts: { page?: number; pageSize?: number; siteId?: string } = {}
) {
  await requirePaidTier(session.orgId);
  const page = opts.page && opts.page > 0 ? opts.page : 1;
  const pageSize = opts.pageSize && opts.pageSize > 0 ? opts.pageSize : 20;
  const where = {
    isCurrentVersion: true,
    deletedAt: null,
    ...(opts.siteId ? { siteId: opts.siteId } : {}),
  };

  const [items, total] = await Promise.all([
    scopedDb(session.orgId).audit.findMany({
      where,
      orderBy: { scheduledDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { site: { select: { name: true } }, sixPillar: { select: { name: true } } },
    }),
    scopedDb(session.orgId).audit.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getAuditById(session: SessionUser, id: string) {
  await requirePaidTier(session.orgId);
  return scopedDb(session.orgId).audit.findUnique({
    where: { id },
    include: {
      site: { select: { name: true } },
      sixPillar: { select: { name: true } },
      completedBy: { select: { name: true, email: true } },
    },
  });
}

export async function getAuditVersionChain(session: SessionUser, id: string) {
  await requirePaidTier(session.orgId);
  return walkVersionChain(id, (fetchId) =>
    scopedDb(session.orgId).audit.findUnique({
      where: { id: fetchId },
      include: {
        previousVersion: { select: { id: true } },
        supersededBy: { select: { id: true } },
      },
    })
  );
}

export async function getAuditActivityLog(session: SessionUser, id: string) {
  await requirePaidTier(session.orgId);
  const chain = await getAuditVersionChain(session, id);
  const ids = chain.map((c) => c.id);
  if (ids.length === 0) return [];
  return scopedDb(session.orgId).auditLogEntry.findMany({
    where: { entityType: "AUDIT", entityId: { in: ids } },
    orderBy: { timestamp: "desc" },
    include: { user: { select: { name: true, email: true } } },
  });
}

// ── Mutations ───────────────────────────────────────────────────────────

export async function createAudit(session: SessionUser, input: CreateAuditInput) {
  await requirePaidTier(session.orgId);

  const site = await scopedDb(session.orgId).site.findUnique({ where: { id: input.siteId } });
  if (!site) throw new Error("Site not found in your organisation");

  const created = await scopedDb(session.orgId).audit.create({
    data: {
      // Explicit here even though scopedDb's create-time injection would
      // overwrite it with this exact value regardless (see
      // src/server/db/scoped-client.ts) — required so the Prisma-generated
      // AuditCreateInput type (orgId has no @default, so it's a required
      // field in the type) is satisfied at compile time.
      orgId: session.orgId,
      siteId: input.siteId,
      type: input.type,
      scheduledDate: new Date(input.scheduledDate),
      sixPillarId: input.sixPillarId ?? null,
      status: "SCHEDULED",
      followUpActions: [],
    },
  });

  await writeAuditLog(session.orgId, {
    entityType: "AUDIT",
    entityId: created.id,
    userId: session.id,
    action: "CREATE",
    afterSnapshot: created,
  });

  return created;
}

/**
 * The append-only versioning "edit" flow: creates a new row (versionNumber
 * + 1, isCurrentVersion: true) then flips the OLD row's isCurrentVersion
 * to false and points its supersededById at the new row. Never an UPDATE
 * of business fields on the existing row.
 *
 * NON-ATOMICITY TRADEOFF (documented per the build instructions): these
 * are two sequential `scopedDb(orgId)` calls, not a single
 * `$transaction`. `scopedDb()` returns a Prisma Client Extension instance
 * constructed fresh per call (see src/server/db/scoped-client.ts) rather
 * than a raw PrismaClient — extension instances do not expose a
 * `$transaction` that would run both statements atomically while
 * preserving the per-call orgId-injection guarantee both statements rely
 * on. For V1 we accept the small window where a crash between the two
 * writes could leave the new row created but the old row not yet marked
 * superseded (both would then show isCurrentVersion: true, which
 * list/detail queries below would need to disambiguate by
 * versionNumber/createdAt as a follow-up). A real fix would run both
 * writes inside a single rawPrisma.$transaction with orgId asserted
 * manually inside the transaction body.
 */
export async function editAudit(session: SessionUser, input: EditAuditInput) {
  await requirePaidTier(session.orgId);
  const old = await requireCurrentAudit(session.orgId, input.id);

  const created = await scopedDb(session.orgId).audit.create({
    data: {
      orgId: session.orgId,
      siteId: old.siteId,
      type: input.type,
      scheduledDate: new Date(input.scheduledDate),
      completedDate: old.completedDate,
      completedById: old.completedById,
      resultScore: input.resultScore ?? old.resultScore,
      sixPillarId: input.sixPillarId ?? null,
      status: old.status,
      followUpActions: input.followUpActions as unknown as Prisma.InputJsonValue,
      versionNumber: old.versionNumber + 1,
      isCurrentVersion: true,
    },
  });

  await scopedDb(session.orgId).audit.update({
    where: { id: old.id },
    data: { isCurrentVersion: false, supersededById: created.id },
  });

  await writeAuditLog(session.orgId, {
    entityType: "AUDIT",
    entityId: created.id,
    userId: session.id,
    action: "UPDATE",
    beforeSnapshot: old,
    afterSnapshot: created,
  });

  return created;
}

/**
 * Approve-level action (status -> COMPLETED). Callers must have checked
 * requireModulePermission("AUDITS", "approve") before calling this — see
 * src/app/dashboard/audits/actions.ts. Still goes through the same
 * versioning flow as editAudit, since status is a business field.
 */
export async function completeAudit(session: SessionUser, input: CompleteAuditInput) {
  await requirePaidTier(session.orgId);
  const old = await requireCurrentAudit(session.orgId, input.id);

  const created = await scopedDb(session.orgId).audit.create({
    data: {
      orgId: session.orgId,
      siteId: old.siteId,
      type: old.type,
      scheduledDate: old.scheduledDate,
      completedDate: new Date(),
      completedById: session.id,
      resultScore: input.resultScore ?? old.resultScore,
      sixPillarId: old.sixPillarId,
      status: "COMPLETED",
      followUpActions: old.followUpActions as Prisma.InputJsonValue,
      versionNumber: old.versionNumber + 1,
      isCurrentVersion: true,
    },
  });

  await scopedDb(session.orgId).audit.update({
    where: { id: old.id },
    data: { isCurrentVersion: false, supersededById: created.id },
  });

  await writeAuditLog(session.orgId, {
    entityType: "AUDIT",
    entityId: created.id,
    userId: session.id,
    action: "APPROVE",
    beforeSnapshot: old,
    afterSnapshot: created,
  });

  return created;
}

/** Soft-delete (void) the current version. Terminal — no new version created. */
export async function voidAudit(session: SessionUser, id: string) {
  await requirePaidTier(session.orgId);
  const current = await requireCurrentAudit(session.orgId, id);

  const updated = await scopedDb(session.orgId).audit.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await writeAuditLog(session.orgId, {
    entityType: "AUDIT",
    entityId: id,
    userId: session.id,
    action: "DELETE",
    beforeSnapshot: current,
    afterSnapshot: updated,
  });

  return updated;
}

// ── Tagging (Reg 17 / CQC key question) ──────────────────────────────────
// sixPillarId is a direct field on Audit (set via createAudit/editAudit
// above), not a tag table — per BUILD_CHECKLIST.md Phase 4 scope notes.

export async function addAuditRegClauseTag(
  session: SessionUser,
  auditId: string,
  regSubClauseId: string
) {
  await requirePaidTier(session.orgId);
  // WRITE-TIME integrity check — see src/server/governance/tagging.ts.
  await assertOwnedEntity(session.orgId, "AUDIT", auditId);

  return scopedDb(session.orgId).regClauseTag.create({
    data: {
      orgId: session.orgId,
      entityType: "AUDIT",
      entityId: auditId,
      regSubClauseId,
      taggedById: session.id,
    },
  });
}

export async function addAuditCQCKeyQuestionTag(
  session: SessionUser,
  auditId: string,
  cqcKeyQuestionId: string
) {
  await requirePaidTier(session.orgId);
  await assertOwnedEntity(session.orgId, "AUDIT", auditId);

  return scopedDb(session.orgId).cQCKeyQuestionTag.create({
    data: {
      orgId: session.orgId,
      entityType: "AUDIT",
      entityId: auditId,
      cqcKeyQuestionId,
      taggedById: session.id,
    },
  });
}

export async function removeAuditRegClauseTag(session: SessionUser, tagId: string) {
  await requirePaidTier(session.orgId);
  return scopedDb(session.orgId).regClauseTag.delete({ where: { id: tagId } });
}

export async function removeAuditCQCKeyQuestionTag(session: SessionUser, tagId: string) {
  await requirePaidTier(session.orgId);
  return scopedDb(session.orgId).cQCKeyQuestionTag.delete({ where: { id: tagId } });
}

/**
 * READ-TIME re-verification (see src/server/governance/tagging.ts for
 * why this is required even though addAuditRegClauseTag/
 * addAuditCQCKeyQuestionTag already check ownership at write-time): before
 * returning any tag rows for auditId, re-confirm auditId still belongs to
 * session.orgId. If it doesn't (e.g. a mismatched row was inserted by a
 * path that bypassed the write-time check), return empty rather than
 * trusting the tag rows' own entityId.
 */
export async function listAuditTags(session: SessionUser, auditId: string) {
  await requirePaidTier(session.orgId);
  const owns = await verifyOwnedEntity(session.orgId, "AUDIT", auditId);
  if (!owns) {
    return { regClauseTags: [], cqcKeyQuestionTags: [] };
  }

  const [regClauseTags, cqcKeyQuestionTags] = await Promise.all([
    scopedDb(session.orgId).regClauseTag.findMany({
      where: { entityType: "AUDIT", entityId: auditId },
      include: { regSubClause: true },
    }),
    scopedDb(session.orgId).cQCKeyQuestionTag.findMany({
      where: { entityType: "AUDIT", entityId: auditId },
      include: { cqcKeyQuestion: true },
    }),
  ]);

  return { regClauseTags, cqcKeyQuestionTags };
}

// ── Attachments ────────────────────────────────────────────────────────

export async function listAuditAttachments(session: SessionUser, auditId: string) {
  await requirePaidTier(session.orgId);
  const owns = await verifyOwnedEntity(session.orgId, "AUDIT", auditId);
  if (!owns) return [];
  return scopedDb(session.orgId).attachment.findMany({
    where: { entityType: "AUDIT", entityId: auditId },
    orderBy: { uploadedAt: "desc" },
  });
}
