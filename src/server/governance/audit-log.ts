import type { AuditLogAction, AuditableEntityType } from "@prisma/client";

import { scopedDb } from "@/server/db/scoped-client";

/**
 * Writes a real AuditLogEntry for a governance-module mutation. This is not
 * decoration — Phase 2's dashboard activity feed and Phase 6's evidence
 * pack both read from this table, so beforeSnapshot/afterSnapshot must be
 * genuine JSON snapshots of the record's business fields, not `{}`.
 *
 * Callers pass plain JSON-serializable snapshots (already-fetched Prisma
 * row data with Date fields converted via JSON.stringify/parse round-trip,
 * which Prisma's Json column accepts directly).
 */
export async function writeAuditLog(
  orgId: string,
  params: {
    entityType: AuditableEntityType;
    entityId: string;
    userId: string;
    action: AuditLogAction;
    beforeSnapshot?: unknown;
    afterSnapshot?: unknown;
  }
) {
  return scopedDb(orgId).auditLogEntry.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      userId: params.userId,
      action: params.action,
      beforeSnapshot: toJsonSnapshot(params.beforeSnapshot),
      afterSnapshot: toJsonSnapshot(params.afterSnapshot),
    },
  });
}

/**
 * Prisma's Json columns require plain JSON values. Dates and other
 * non-JSON-native values (Prisma Decimal, etc.) are round-tripped through
 * JSON.stringify/parse so the snapshot stored is exactly what a reader
 * would see rendered (ISO date strings), and so the call never throws on
 * an unsupported value type.
 */
function toJsonSnapshot(value: unknown): object | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as object;
}
