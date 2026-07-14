import type { AuditLogAction, AuditableEntityType } from "@prisma/client";

import type { ScopedDb } from "@/server/db/scoped-client";

/**
 * Shared helper so every Phase 5 module writes AuditLogEntry rows the same
 * way. Must be called with a db already scoped to the caller's orgId
 * (scopedDb(session.orgId)) — this file never touches rawPrisma.
 */
export async function writeAuditLog(
  db: ScopedDb,
  entry: {
    orgId: string;
    userId: string;
    entityType: AuditableEntityType;
    entityId: string;
    action: AuditLogAction;
    before?: unknown;
    after?: unknown;
  }
) {
  return db.auditLogEntry.create({
    data: {
      orgId: entry.orgId,
      userId: entry.userId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      beforeSnapshot: entry.before === undefined ? undefined : (entry.before as never),
      afterSnapshot: entry.after === undefined ? undefined : (entry.after as never),
    },
  });
}
