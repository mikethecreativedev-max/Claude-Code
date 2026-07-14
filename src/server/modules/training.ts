import { z } from "zod";
import type { TrainingStatus } from "@prisma/client";

import { scopedDb, type ScopedDb } from "@/server/db/scoped-client";
import { requireModulePermission } from "@/server/rbac/permissions";
import type { SessionUser } from "@/server/auth/session";
import { writeAuditLog } from "@/server/modules/audit-log";
import { createNotificationIfMissing } from "@/server/modules/notifications";

// Expiry threshold: a training record whose expiryDate falls within this
// many days of "now" (and hasn't already passed) is EXPIRING_SOON. Past
// expiryDate is EXPIRED. Documented here per BUILD_CHECKLIST.md Phase 5
// acceptance criteria ("define and document the threshold").
export const EXPIRING_SOON_WINDOW_DAYS = 30;

/** Pure function, unit-testable without a database. */
export function deriveTrainingStatus(
  expiryDate: Date | null,
  now: Date = new Date()
): TrainingStatus {
  if (!expiryDate) return "VALID";
  const msUntilExpiry = expiryDate.getTime() - now.getTime();
  if (msUntilExpiry < 0) return "EXPIRED";
  const daysUntilExpiry = msUntilExpiry / (1000 * 60 * 60 * 24);
  if (daysUntilExpiry <= EXPIRING_SOON_WINDOW_DAYS) return "EXPIRING_SOON";
  return "VALID";
}

export const createTrainingRecordSchema = z.object({
  siteId: z.string().min(1),
  userId: z.string().min(1),
  courseName: z.string().min(1).max(300),
  completionDate: z.coerce.date(),
  expiryDate: z.coerce.date().optional(),
});
export type CreateTrainingRecordInput = z.infer<typeof createTrainingRecordSchema>;

export const updateTrainingRecordSchema = z.object({
  courseName: z.string().min(1).max(300).optional(),
  completionDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().nullable().optional(),
});
export type UpdateTrainingRecordInput = z.infer<typeof updateTrainingRecordSchema>;

export async function requireTrainingViewSession(): Promise<SessionUser> {
  return requireModulePermission("TRAINING", "view");
}

function trainingTaskTitle(courseName: string): string {
  return `Training expiry: ${courseName}`;
}

/**
 * Ensures a CalendarTask exists for a training record that is currently
 * EXPIRING_SOON or EXPIRED (linkedModule: 'TRAINING', linkedEntityId: the
 * TrainingRecord id). Idempotent: calling this repeatedly for the same
 * record never creates more than one CalendarTask — it looks for an
 * existing row keyed on (linkedModule, linkedEntityId) first and updates
 * it in place rather than creating a duplicate. Also creates (at most once,
 * idempotently) a Notification for the assigned user the first time the
 * record is found in EXPIRING_SOON status.
 */
export async function ensureTrainingCalendarTask(
  db: ScopedDb,
  orgId: string,
  record: {
    id: string;
    siteId: string;
    userId: string;
    courseName: string;
    expiryDate: Date | null;
  },
  status: TrainingStatus
) {
  if (status !== "EXPIRING_SOON" && status !== "EXPIRED") {
    return null;
  }
  if (!record.expiryDate) {
    // Should be unreachable (deriveTrainingStatus only returns
    // EXPIRING_SOON/EXPIRED when expiryDate is set), but guard anyway.
    return null;
  }

  const existing = await db.calendarTask.findFirst({
    where: { linkedModule: "TRAINING", linkedEntityId: record.id },
  });

  const desiredTitle = trainingTaskTitle(record.courseName);

  if (existing) {
    if (
      existing.dueDate.getTime() !== record.expiryDate.getTime() ||
      existing.title !== desiredTitle
    ) {
      return db.calendarTask.update({
        where: { id: existing.id },
        data: { title: desiredTitle, dueDate: record.expiryDate },
      });
    }
    return existing;
  }

  const task = await db.calendarTask.create({
    data: {
      siteId: record.siteId,
      linkedModule: "TRAINING",
      linkedEntityId: record.id,
      title: desiredTitle,
      dueDate: record.expiryDate,
      assignedToId: record.userId,
      status: "PENDING",
    } as never,
  });

  if (status === "EXPIRING_SOON") {
    await createNotificationIfMissing(db, {
      orgId,
      userId: record.userId,
      type: "TRAINING_EXPIRING_SOON",
      relatedEntityType: "TRAINING_RECORD",
      relatedEntityId: record.id,
    });
  }

  return task;
}

/**
 * Live status derivation + calendar sync, callable on read. For every
 * training record fetched: (1) compute the current status from
 * expiryDate/now rather than trusting the stored `status` column, (2)
 * persist that status if it changed, (3) ensure a CalendarTask exists for
 * EXPIRING_SOON/EXPIRED records (idempotent — see ensureTrainingCalendarTask).
 */
export async function listTrainingRecords(session: SessionUser) {
  const db = scopedDb(session.orgId);
  const records = await db.trainingRecord.findMany({
    where: { deletedAt: null },
    orderBy: { expiryDate: "asc" },
    include: { site: { select: { name: true } }, user: { select: { name: true, email: true } } },
  });

  const now = new Date();
  const withLiveStatus = [];
  for (const record of records) {
    const liveStatus = deriveTrainingStatus(record.expiryDate, now);
    let current = record;
    if (liveStatus !== record.status) {
      current = await db.trainingRecord.update({
        where: { id: record.id },
        data: { status: liveStatus },
        include: {
          site: { select: { name: true } },
          user: { select: { name: true, email: true } },
        },
      });
    }
    await ensureTrainingCalendarTask(db, session.orgId, current, liveStatus);
    withLiveStatus.push(current);
  }
  return withLiveStatus;
}

export async function createTrainingRecord(
  session: SessionUser,
  input: CreateTrainingRecordInput
) {
  const db = scopedDb(session.orgId);

  const site = await db.site.findUnique({ where: { id: input.siteId } });
  if (!site) throw new Error("Site not found in caller's organisation");
  const user = await db.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new Error("User not found in caller's organisation");

  const status = deriveTrainingStatus(input.expiryDate ?? null);

  const created = await db.trainingRecord.create({
    data: {
      siteId: input.siteId,
      userId: input.userId,
      courseName: input.courseName,
      completionDate: input.completionDate,
      expiryDate: input.expiryDate,
      status,
    } as never,
  });

  await ensureTrainingCalendarTask(db, session.orgId, created, status);

  await writeAuditLog(db, {
    orgId: session.orgId,
    userId: session.id,
    entityType: "TRAINING_RECORD",
    entityId: created.id,
    action: "CREATE",
    after: created,
  });

  return created;
}

export async function updateTrainingRecord(
  session: SessionUser,
  id: string,
  input: UpdateTrainingRecordInput
) {
  const db = scopedDb(session.orgId);

  const before = await db.trainingRecord.findUnique({ where: { id } });
  if (!before) throw new Error("Training record not found in caller's organisation");

  const nextExpiryDate =
    input.expiryDate === undefined ? before.expiryDate : input.expiryDate;
  const status = deriveTrainingStatus(nextExpiryDate);

  const updated = await db.trainingRecord.update({
    where: { id },
    data: { ...input, status },
  });

  await ensureTrainingCalendarTask(db, session.orgId, updated, status);

  await writeAuditLog(db, {
    orgId: session.orgId,
    userId: session.id,
    entityType: "TRAINING_RECORD",
    entityId: updated.id,
    action: "UPDATE",
    before,
    after: updated,
  });

  return updated;
}
