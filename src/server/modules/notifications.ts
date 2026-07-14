import type { AuditableEntityType } from "@prisma/client";

import { scopedDb, type ScopedDb } from "@/server/db/scoped-client";
import { requireAuth, type SessionUser } from "@/server/auth/session";

/**
 * Notifications are system-generated and DISTINCT from Notices (a separate
 * table — see prisma/schema.prisma). Nothing in this file writes to the
 * Notice model, and nothing in notices.ts writes to Notification directly
 * except via createNotification() below, so the two never get conflated.
 *
 * There is no `NOTIFICATIONS` entry in the `ModuleName` enum / RolePermission
 * matrix — notifications are personal inbox items scoped to the owning
 * user, not a governance module with view/edit/approve semantics. Access
 * control here is therefore: requireAuth() (who are you) + org check
 * (scopedDb) + an explicit ownership check (userId === session.id) rather
 * than requireModulePermission(). This is a deliberate, narrower departure
 * from the standard auth->org->RBAC chain, documented here rather than
 * silently deviating from it.
 */

/** Internal helper: create a Notification as a side effect of some other
 * module's mutation. Callers must pass a db already scoped to the org the
 * notification belongs to. Not exported for direct use by routes — routes
 * should go through the owning module's service (notices.ts, training.ts). */
export async function createNotification(
  db: ScopedDb,
  entry: {
    orgId: string;
    userId: string;
    type: string;
    relatedEntityType?: AuditableEntityType;
    relatedEntityId?: string;
  }
) {
  return db.notification.create({
    data: {
      orgId: entry.orgId,
      userId: entry.userId,
      type: entry.type,
      relatedEntityType: entry.relatedEntityType,
      relatedEntityId: entry.relatedEntityId,
    },
  });
}

/** Idempotent variant: only creates if a matching notification for this
 * user/type/related entity doesn't already exist. Used by side-effect call
 * sites (e.g. training status re-derived on every read) so repeated calls
 * don't spam duplicate notifications. */
export async function createNotificationIfMissing(
  db: ScopedDb,
  entry: {
    orgId: string;
    userId: string;
    type: string;
    relatedEntityType?: AuditableEntityType;
    relatedEntityId?: string;
  }
) {
  const existing = await db.notification.findFirst({
    where: {
      userId: entry.userId,
      type: entry.type,
      relatedEntityType: entry.relatedEntityType ?? null,
      relatedEntityId: entry.relatedEntityId ?? null,
    },
  });
  if (existing) return existing;
  return createNotification(db, entry);
}

export async function listNotifications(session: SessionUser) {
  const db = scopedDb(session.orgId);
  return db.notification.findMany({
    where: { userId: session.id },
    orderBy: { sentAt: "desc" },
  });
}

export async function markNotificationRead(session: SessionUser, notificationId: string) {
  const db = scopedDb(session.orgId);
  const notification = await db.notification.findUnique({ where: { id: notificationId } });
  if (!notification || notification.userId !== session.id) {
    throw new Error("Notification not found");
  }
  return db.notification.update({
    where: { id: notificationId },
    data: { readStatus: true, readAt: new Date() },
  });
}

export async function requireAuthenticatedUser(): Promise<SessionUser> {
  return requireAuth();
}
