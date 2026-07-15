import { Prisma, type AuditLogAction, type AuditableEntityType } from "@prisma/client";

import type { ScopedDb } from "@/server/db/scoped-client";

/**
 * Every mutation on RiskEntry / Policy (create, edit/versioning, void,
 * status-change/approve) MUST write a real AuditLogEntry via scopedDb(orgId)
 * with a non-trivial before/after snapshot — see BUILD_CHECKLIST.md Phase 4
 * and prisma/schema.prisma's APPEND-ONLY / VERSIONING header comment.
 * Phase 2's dashboard activity feed and Phase 6's evidence pack both read
 * this table, so snapshots must be the real row contents, not `{}`.
 *
 * `db` must already be an org-scoped client (scopedDb(orgId)) — this
 * helper does not accept a bare orgId on purpose, so it can never be
 * called in a way that bypasses the tenant-scoping layer. scopedDb injects
 * orgId into the create() call automatically, same as any other tenant
 * model write.
 */
export async function writeAuditLog(
  db: ScopedDb,
  params: {
    entityType: AuditableEntityType;
    entityId: string;
    userId: string;
    action: AuditLogAction;
    beforeSnapshot: Prisma.InputJsonValue | null;
    afterSnapshot: Prisma.InputJsonValue | null;
  }
) {
  return db.auditLogEntry.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      userId: params.userId,
      action: params.action,
      beforeSnapshot: params.beforeSnapshot ?? Prisma.JsonNull,
      afterSnapshot: params.afterSnapshot ?? Prisma.JsonNull,
    },
  });
}
