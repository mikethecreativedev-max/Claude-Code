import { z } from "zod";
import type { EventStatus, TaggableEntityType, AttachableEntityType } from "@prisma/client";

import { scopedDb } from "@/server/db/scoped-client";
import { requireModulePermission } from "@/server/rbac/permissions";
import type { SessionUser } from "@/server/auth/session";
import { writeAuditLog } from "@/server/modules/audit-log";
import { saveLocalUpload } from "@/server/storage/local-upload";

// ─────────────────────────────────────────────────────────────────────────
// EVENTS — DEFINITION PENDING PRODUCT CONFIRMATION
// ─────────────────────────────────────────────────────────────────────────
// The Events module's semantics are intentionally undefined by the source
// spec (see BUILD_CHECKLIST.md "Known open item" and README.md "Known open
// item: Events"). This file implements ONLY a minimal generic log:
// eventType is free text (with UI suggestions, not an enum — see
// SUGGESTED_EVENT_TYPES below), plus title/description/dateTime/status,
// tagging via RegClauseTag, and attachment metadata. Do NOT extend this
// with Incident-like semantics (severity grading, CQC notifiability, etc.)
// and do NOT merge Event with Incident or make one a subtype of the other
// — both are explicit non-goals per the source doc. This must be resolved
// by product/client confirmation, not invented here.

export const SUGGESTED_EVENT_TYPES = [
  "Inspection visit",
  "Safeguarding referral",
  "Significant event",
  "CQC notification",
  "Staff meeting",
  "External audit",
] as const;

export const createEventSchema = z.object({
  siteId: z.string().min(1),
  eventType: z.string().min(1).max(200), // free text — see SUGGESTED_EVENT_TYPES
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(5000),
  dateTime: z.coerce.date(),
  status: z.enum(["OPEN", "CLOSED"]).optional(),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = z.object({
  eventType: z.string().min(1).max(200).optional(),
  title: z.string().min(1).max(300).optional(),
  description: z.string().min(1).max(5000).optional(),
  dateTime: z.coerce.date().optional(),
  status: z.enum(["OPEN", "CLOSED"]).optional(),
});
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const tagEventSchema = z.object({
  regSubClauseId: z.string().min(1),
});

export const attachToEventSchema = z.object({
  s3Key: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

export async function requireEventsViewSession(): Promise<SessionUser> {
  return requireModulePermission("EVENTS", "view");
}

export async function listEvents(session: SessionUser) {
  const db = scopedDb(session.orgId);
  return db.event.findMany({
    where: { deletedAt: null },
    orderBy: { dateTime: "desc" },
    include: { site: { select: { name: true } } },
  });
}

/** Detail view: the event plus its tags and attachments. Tags/attachments
 * are polymorphic (entityType + entityId, no DB-level FK — see the schema
 * header comment), so this reads them scoped by orgId via scopedDb plus
 * filtered to this specific, already-org-verified event's id. */
export async function getEvent(session: SessionUser, id: string) {
  const db = scopedDb(session.orgId);
  const event = await db.event.findUnique({
    where: { id },
    include: { site: { select: { name: true } } },
  });
  if (!event) return null;

  const [tags, attachments] = await Promise.all([
    db.regClauseTag.findMany({
      where: { entityType: EVENT_ENTITY_TYPE, entityId: id },
      include: { regSubClause: true },
    }),
    db.attachment.findMany({
      where: { entityType: EVENT_ATTACHABLE_TYPE, entityId: id },
      orderBy: { uploadedAt: "desc" },
    }),
  ]);

  return { event, tags, attachments };
}

/** Reg 17 sub-clauses for the tagging dropdown — global reference data
 * (no orgId column at all; see prisma/schema.prisma), read via scopedDb
 * purely for import-discipline consistency with the rest of this module. */
export async function listRegSubClausesForTagging(session: SessionUser) {
  const db = scopedDb(session.orgId);
  return db.regulatorySubClause.findMany({ orderBy: { subParagraph: "asc" } });
}

export async function createEvent(session: SessionUser, input: CreateEventInput) {
  const db = scopedDb(session.orgId);

  const site = await db.site.findUnique({ where: { id: input.siteId } });
  if (!site) throw new Error("Site not found in caller's organisation");

  const created = await db.event.create({
    data: {
      siteId: input.siteId,
      eventType: input.eventType,
      title: input.title,
      description: input.description,
      dateTime: input.dateTime,
      status: (input.status ?? "OPEN") as EventStatus,
    } as never,
  });

  await writeAuditLog(db, {
    orgId: session.orgId,
    userId: session.id,
    entityType: "EVENT",
    entityId: created.id,
    action: "CREATE",
    after: created,
  });

  return created;
}

export async function updateEvent(session: SessionUser, id: string, input: UpdateEventInput) {
  const db = scopedDb(session.orgId);

  const before = await db.event.findUnique({ where: { id } });
  if (!before) throw new Error("Event not found in caller's organisation");

  const updated = await db.event.update({ where: { id }, data: input });

  await writeAuditLog(db, {
    orgId: session.orgId,
    userId: session.id,
    entityType: "EVENT",
    entityId: updated.id,
    action: "UPDATE",
    before,
    after: updated,
  });

  return updated;
}

const EVENT_ENTITY_TYPE: TaggableEntityType = "EVENT";
const EVENT_ATTACHABLE_TYPE: AttachableEntityType = "EVENT";

/** Tags an Event against the Reg 17 taxonomy. Verifies entityId (the
 * event) belongs to the caller's orgId before insert — this is the
 * specific integrity gap the schema header calls out for the polymorphic
 * tag tables, closed here rather than assumed. */
export async function tagEvent(session: SessionUser, eventId: string, regSubClauseId: string) {
  const db = scopedDb(session.orgId);

  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) throw new Error("Event not found in caller's organisation");

  return db.regClauseTag.create({
    data: {
      entityType: EVENT_ENTITY_TYPE,
      entityId: eventId,
      regSubClauseId,
      taggedById: session.id,
    } as never,
  });
}

export async function listEventTags(session: SessionUser, eventId: string) {
  const db = scopedDb(session.orgId);
  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) throw new Error("Event not found in caller's organisation");

  return db.regClauseTag.findMany({
    where: { entityType: EVENT_ENTITY_TYPE, entityId: eventId },
    include: { regSubClause: true },
  });
}

/** Records attachment metadata for an Event, given metadata the caller
 * already has (the JSON API contract — no real S3 client is configured in
 * this environment, see README "not yet wired (Phase 4+)"). The dashboard's
 * real file-upload form goes through `uploadEventAttachment` below instead,
 * which produces this same metadata shape from an actual file. */
export async function attachToEvent(
  session: SessionUser,
  eventId: string,
  input: z.infer<typeof attachToEventSchema>
) {
  const db = scopedDb(session.orgId);

  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) throw new Error("Event not found in caller's organisation");

  return db.attachment.create({
    data: {
      entityType: EVENT_ATTACHABLE_TYPE,
      entityId: eventId,
      s3Key: input.s3Key,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      uploadedById: session.id,
    } as never,
  });
}

/** Real file upload path used by the dashboard's multipart upload form.
 * Writes the file to the local, gitignored `.uploads/` directory (see
 * src/server/storage/local-upload.ts for why: no S3-compatible client is
 * configured in this environment, and Events attachments in Phase 5 need
 * something real to exercise rather than a metadata-only stub) and then
 * records it exactly like `attachToEvent` above — same table, same shape,
 * same org-ownership check before any write. */
export async function uploadEventAttachment(session: SessionUser, eventId: string, file: File) {
  const db = scopedDb(session.orgId);

  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) throw new Error("Event not found in caller's organisation");

  const meta = await saveLocalUpload(session.orgId, "EVENT", eventId, file);

  const attachment = await db.attachment.create({
    data: {
      entityType: EVENT_ATTACHABLE_TYPE,
      entityId: eventId,
      s3Key: meta.s3Key,
      fileName: meta.fileName,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes,
      uploadedById: session.id,
    } as never,
  });

  await writeAuditLog(db, {
    orgId: session.orgId,
    userId: session.id,
    entityType: "EVENT",
    entityId: eventId,
    action: "UPDATE",
    after: { attachmentAdded: attachment.fileName },
  });

  return attachment;
}

export async function listEventAttachments(session: SessionUser, eventId: string) {
  const db = scopedDb(session.orgId);
  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) throw new Error("Event not found in caller's organisation");

  return db.attachment.findMany({
    where: { entityType: EVENT_ATTACHABLE_TYPE, entityId: eventId },
    orderBy: { uploadedAt: "desc" },
  });
}
