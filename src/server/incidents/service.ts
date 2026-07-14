import type { Prisma } from "@prisma/client";

import { scopedDb } from "@/server/db/scoped-client";
import type { SessionUser } from "@/server/auth/session";
import { requirePaidTier } from "@/server/rbac/tier-check";
import { writeAuditLog } from "@/server/governance/audit-log";
import { walkVersionChain } from "@/server/governance/version-chain";
import { verifyOwnedEntity, assertOwnedEntity } from "@/server/governance/tagging";
import {
  type CreateIncidentInput,
  type EditIncidentInput,
  type CloseIncidentInput,
} from "@/server/incidents/schemas";

export class IncidentNotFoundError extends Error {
  constructor(id: string) {
    super(`No Incident with id "${id}" exists in your organisation`);
    this.name = "IncidentNotFoundError";
  }
}

export class SuperseededVersionError extends Error {
  constructor() {
    super("This is a superseded version of the incident; edit the current version instead");
    this.name = "SuperseededVersionError";
  }
}

async function requireCurrentIncident(orgId: string, id: string) {
  const incident = await scopedDb(orgId).incident.findUnique({ where: { id } });
  if (!incident) throw new IncidentNotFoundError(id);
  if (!incident.isCurrentVersion) throw new SuperseededVersionError();
  return incident;
}

// ── List / read ────────────────────────────────────────────────────────

export async function listCurrentIncidents(
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
    scopedDb(session.orgId).incident.findMany({
      where,
      orderBy: { dateTime: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { site: { select: { name: true } }, reportedBy: { select: { name: true } } },
    }),
    scopedDb(session.orgId).incident.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getIncidentById(session: SessionUser, id: string) {
  await requirePaidTier(session.orgId);
  return scopedDb(session.orgId).incident.findUnique({
    where: { id },
    include: {
      site: { select: { name: true } },
      reportedBy: { select: { name: true, email: true } },
    },
  });
}

export async function getIncidentVersionChain(session: SessionUser, id: string) {
  await requirePaidTier(session.orgId);
  return walkVersionChain(id, (fetchId) =>
    scopedDb(session.orgId).incident.findUnique({
      where: { id: fetchId },
      include: {
        previousVersion: { select: { id: true } },
        supersededBy: { select: { id: true } },
      },
    })
  );
}

export async function getIncidentActivityLog(session: SessionUser, id: string) {
  await requirePaidTier(session.orgId);
  const chain = await getIncidentVersionChain(session, id);
  const ids = chain.map((c) => c.id);
  if (ids.length === 0) return [];
  return scopedDb(session.orgId).auditLogEntry.findMany({
    where: { entityType: "INCIDENT", entityId: { in: ids } },
    orderBy: { timestamp: "desc" },
    include: { user: { select: { name: true, email: true } } },
  });
}

// ── Mutations ───────────────────────────────────────────────────────────

export async function createIncident(session: SessionUser, input: CreateIncidentInput) {
  await requirePaidTier(session.orgId);

  const site = await scopedDb(session.orgId).site.findUnique({ where: { id: input.siteId } });
  if (!site) throw new Error("Site not found in your organisation");

  const created = await scopedDb(session.orgId).incident.create({
    data: {
      // Explicit here even though scopedDb's create-time injection would
      // overwrite it with this exact value regardless (see
      // src/server/db/scoped-client.ts) — required so the Prisma-generated
      // IncidentCreateInput type (orgId has no @default, so it's a
      // required field in the type) is satisfied at compile time.
      orgId: session.orgId,
      siteId: input.siteId,
      reportedById: session.id,
      dateTime: new Date(input.dateTime),
      description: input.description,
      anonymisationAcknowledged: input.anonymisationAcknowledged,
      severityGrading: input.severityGrading,
      psirfClassification: input.psirfClassification,
      notifiableToCQC: input.notifiableToCQC,
      status: "OPEN",
      followUpActions: [],
    },
  });

  await writeAuditLog(session.orgId, {
    entityType: "INCIDENT",
    entityId: created.id,
    userId: session.id,
    action: "CREATE",
    afterSnapshot: created,
  });

  return created;
}

/**
 * Append-only versioning "edit" flow — see the detailed non-atomicity note
 * on src/server/audits/service.ts's editAudit, which applies identically
 * here: two sequential scopedDb(orgId) calls rather than a $transaction,
 * because scopedDb() wraps a per-call Prisma Client Extension rather than
 * a raw PrismaClient.
 */
export async function editIncident(session: SessionUser, input: EditIncidentInput) {
  await requirePaidTier(session.orgId);
  const old = await requireCurrentIncident(session.orgId, input.id);

  const created = await scopedDb(session.orgId).incident.create({
    data: {
      orgId: session.orgId,
      siteId: old.siteId,
      reportedById: old.reportedById,
      dateTime: new Date(input.dateTime),
      description: input.description,
      anonymisationAcknowledged: old.anonymisationAcknowledged,
      severityGrading: input.severityGrading,
      psirfClassification: input.psirfClassification,
      notifiableToCQC: input.notifiableToCQC,
      status: old.status,
      followUpActions: input.followUpActions as unknown as Prisma.InputJsonValue,
      versionNumber: old.versionNumber + 1,
      isCurrentVersion: true,
    },
  });

  await scopedDb(session.orgId).incident.update({
    where: { id: old.id },
    data: { isCurrentVersion: false, supersededById: created.id },
  });

  await writeAuditLog(session.orgId, {
    entityType: "INCIDENT",
    entityId: created.id,
    userId: session.id,
    action: "UPDATE",
    beforeSnapshot: old,
    afterSnapshot: created,
  });

  return created;
}

/**
 * Approve-level action: OPEN/INVESTIGATING -> INVESTIGATING (start
 * investigation, "edit"-level) is handled by editIncident via a status
 * change is NOT allowed there — status transitions to INVESTIGATING and
 * CLOSED are modeled as their own explicit actions so the approve-gated
 * CLOSED transition can't be smuggled through the plain edit form.
 */
export async function startInvestigation(session: SessionUser, id: string) {
  await requirePaidTier(session.orgId);
  const old = await requireCurrentIncident(session.orgId, id);
  if (old.status === "CLOSED") {
    throw new Error("Cannot reopen a closed incident via startInvestigation");
  }

  const created = await scopedDb(session.orgId).incident.create({
    data: {
      orgId: session.orgId,
      siteId: old.siteId,
      reportedById: old.reportedById,
      dateTime: old.dateTime,
      description: old.description,
      anonymisationAcknowledged: old.anonymisationAcknowledged,
      severityGrading: old.severityGrading,
      psirfClassification: old.psirfClassification,
      notifiableToCQC: old.notifiableToCQC,
      status: "INVESTIGATING",
      followUpActions: old.followUpActions as Prisma.InputJsonValue,
      versionNumber: old.versionNumber + 1,
      isCurrentVersion: true,
    },
  });

  await scopedDb(session.orgId).incident.update({
    where: { id: old.id },
    data: { isCurrentVersion: false, supersededById: created.id },
  });

  await writeAuditLog(session.orgId, {
    entityType: "INCIDENT",
    entityId: created.id,
    userId: session.id,
    action: "UPDATE",
    beforeSnapshot: old,
    afterSnapshot: created,
  });

  return created;
}

/**
 * Approve-level action (status -> CLOSED, "an incident CLOSED after
 * investigation" per the hard rules — requires
 * requireModulePermission('INCIDENTS', 'approve') at the call site, see
 * src/app/dashboard/incidents/actions.ts).
 */
export async function closeIncident(session: SessionUser, input: CloseIncidentInput) {
  await requirePaidTier(session.orgId);
  const old = await requireCurrentIncident(session.orgId, input.id);

  const created = await scopedDb(session.orgId).incident.create({
    data: {
      orgId: session.orgId,
      siteId: old.siteId,
      reportedById: old.reportedById,
      dateTime: old.dateTime,
      description: old.description,
      anonymisationAcknowledged: old.anonymisationAcknowledged,
      severityGrading: old.severityGrading,
      psirfClassification: old.psirfClassification,
      notifiableToCQC: old.notifiableToCQC,
      status: "CLOSED",
      followUpActions: old.followUpActions as Prisma.InputJsonValue,
      versionNumber: old.versionNumber + 1,
      isCurrentVersion: true,
    },
  });

  await scopedDb(session.orgId).incident.update({
    where: { id: old.id },
    data: { isCurrentVersion: false, supersededById: created.id },
  });

  await writeAuditLog(session.orgId, {
    entityType: "INCIDENT",
    entityId: created.id,
    userId: session.id,
    action: "APPROVE",
    beforeSnapshot: old,
    afterSnapshot: created,
  });

  return created;
}

/** Soft-delete (void) the current version. Terminal — no new version created. */
export async function voidIncident(session: SessionUser, id: string) {
  await requirePaidTier(session.orgId);
  const current = await requireCurrentIncident(session.orgId, id);

  const updated = await scopedDb(session.orgId).incident.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await writeAuditLog(session.orgId, {
    entityType: "INCIDENT",
    entityId: id,
    userId: session.id,
    action: "DELETE",
    beforeSnapshot: current,
    afterSnapshot: updated,
  });

  return updated;
}

// ── Tagging (Reg 17 / CQC key question / Six Pillar) ─────────────────────
// Incident has no direct sixPillarId field (unlike Audit) — Six Pillar
// linkage goes through SixPillarTag like the other two taxonomies.

export async function addIncidentRegClauseTag(
  session: SessionUser,
  incidentId: string,
  regSubClauseId: string
) {
  await requirePaidTier(session.orgId);
  await assertOwnedEntity(session.orgId, "INCIDENT", incidentId);
  return scopedDb(session.orgId).regClauseTag.create({
    data: {
      orgId: session.orgId,
      entityType: "INCIDENT",
      entityId: incidentId,
      regSubClauseId,
      taggedById: session.id,
    },
  });
}

export async function addIncidentCQCKeyQuestionTag(
  session: SessionUser,
  incidentId: string,
  cqcKeyQuestionId: string
) {
  await requirePaidTier(session.orgId);
  await assertOwnedEntity(session.orgId, "INCIDENT", incidentId);
  return scopedDb(session.orgId).cQCKeyQuestionTag.create({
    data: {
      orgId: session.orgId,
      entityType: "INCIDENT",
      entityId: incidentId,
      cqcKeyQuestionId,
      taggedById: session.id,
    },
  });
}

export async function addIncidentSixPillarTag(
  session: SessionUser,
  incidentId: string,
  sixPillarId: string
) {
  await requirePaidTier(session.orgId);
  await assertOwnedEntity(session.orgId, "INCIDENT", incidentId);
  return scopedDb(session.orgId).sixPillarTag.create({
    data: {
      orgId: session.orgId,
      entityType: "INCIDENT",
      entityId: incidentId,
      sixPillarId,
      taggedById: session.id,
    },
  });
}

export async function removeIncidentRegClauseTag(session: SessionUser, tagId: string) {
  await requirePaidTier(session.orgId);
  return scopedDb(session.orgId).regClauseTag.delete({ where: { id: tagId } });
}

export async function removeIncidentCQCKeyQuestionTag(session: SessionUser, tagId: string) {
  await requirePaidTier(session.orgId);
  return scopedDb(session.orgId).cQCKeyQuestionTag.delete({ where: { id: tagId } });
}

export async function removeIncidentSixPillarTag(session: SessionUser, tagId: string) {
  await requirePaidTier(session.orgId);
  return scopedDb(session.orgId).sixPillarTag.delete({ where: { id: tagId } });
}

/**
 * READ-TIME re-verification — see src/server/governance/tagging.ts. Never
 * trust a tag row's own entityId as proof it belongs to this org's
 * incident; re-check via scopedDb before returning anything.
 */
export async function listIncidentTags(session: SessionUser, incidentId: string) {
  await requirePaidTier(session.orgId);
  const owns = await verifyOwnedEntity(session.orgId, "INCIDENT", incidentId);
  if (!owns) {
    return { regClauseTags: [], cqcKeyQuestionTags: [], sixPillarTags: [] };
  }

  const [regClauseTags, cqcKeyQuestionTags, sixPillarTags] = await Promise.all([
    scopedDb(session.orgId).regClauseTag.findMany({
      where: { entityType: "INCIDENT", entityId: incidentId },
      include: { regSubClause: true },
    }),
    scopedDb(session.orgId).cQCKeyQuestionTag.findMany({
      where: { entityType: "INCIDENT", entityId: incidentId },
      include: { cqcKeyQuestion: true },
    }),
    scopedDb(session.orgId).sixPillarTag.findMany({
      where: { entityType: "INCIDENT", entityId: incidentId },
      include: { sixPillar: true },
    }),
  ]);

  return { regClauseTags, cqcKeyQuestionTags, sixPillarTags };
}

// ── Attachments ────────────────────────────────────────────────────────

export async function listIncidentAttachments(session: SessionUser, incidentId: string) {
  await requirePaidTier(session.orgId);
  const owns = await verifyOwnedEntity(session.orgId, "INCIDENT", incidentId);
  if (!owns) return [];
  return scopedDb(session.orgId).attachment.findMany({
    where: { entityType: "INCIDENT", entityId: incidentId },
    orderBy: { uploadedAt: "desc" },
  });
}
