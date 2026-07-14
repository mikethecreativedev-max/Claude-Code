import { z } from "zod";
import type { FeedbackSource, FeedbackStatus } from "@prisma/client";

import { scopedDb } from "@/server/db/scoped-client";
import { requireModulePermission } from "@/server/rbac/permissions";
import type { SessionUser } from "@/server/auth/session";
import { writeAuditLog } from "@/server/modules/audit-log";

// PAID-tier note: BUILD_CHECKLIST.md Phase 5 instructions ask us to check
// for a requireTier('PAID') helper (Phase 3, separate worktree). As of this
// worktree's branch point it does not exist under src/server/rbac or
// src/server/auth (confirmed by grep before writing this module), so this
// module relies on requireModulePermission() alone. Revisit once Phase 3
// lands and wire requireTier('PAID') in alongside it — see README.

export const createFeedbackSchema = z.object({
  siteId: z.string().min(1),
  source: z.enum(["PATIENT", "STAFF"]),
  category: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  outcome: z.string().max(5000).optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
});
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;

export const updateFeedbackSchema = z.object({
  category: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
  outcome: z.string().max(5000).optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
});
export type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>;

export async function listFeedback(session: SessionUser) {
  const db = scopedDb(session.orgId);
  return db.feedbackComplaint.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { site: { select: { name: true } } },
  });
}

export async function requireFeedbackViewSession(): Promise<SessionUser> {
  return requireModulePermission("FEEDBACK_COMPLAINTS", "view");
}

export async function getFeedback(session: SessionUser, id: string) {
  const db = scopedDb(session.orgId);
  return db.feedbackComplaint.findUnique({
    where: { id },
    include: { site: { select: { name: true } } },
  });
}

export async function createFeedback(session: SessionUser, input: CreateFeedbackInput) {
  const db = scopedDb(session.orgId);

  // entityId/site integrity: verify the site belongs to the caller's org
  // before writing (same class of check the schema header calls out for
  // the polymorphic tag tables — here it's a direct FK so scopedDb's
  // orgId-scoped findUnique is sufficient).
  const site = await db.site.findUnique({ where: { id: input.siteId } });
  if (!site) throw new Error("Site not found in caller's organisation");

  const created = await db.feedbackComplaint.create({
    data: {
      siteId: input.siteId,
      source: input.source as FeedbackSource,
      category: input.category,
      description: input.description,
      outcome: input.outcome,
      status: (input.status ?? "OPEN") as FeedbackStatus,
    } as never,
  });

  await writeAuditLog(db, {
    orgId: session.orgId,
    userId: session.id,
    entityType: "FEEDBACK_COMPLAINT",
    entityId: created.id,
    action: "CREATE",
    after: created,
  });

  return created;
}

export async function updateFeedback(
  session: SessionUser,
  id: string,
  input: UpdateFeedbackInput
) {
  const db = scopedDb(session.orgId);

  const before = await db.feedbackComplaint.findUnique({ where: { id } });
  if (!before) throw new Error("Feedback/complaint not found in caller's organisation");

  const updated = await db.feedbackComplaint.update({
    where: { id },
    data: input,
  });

  await writeAuditLog(db, {
    orgId: session.orgId,
    userId: session.id,
    entityType: "FEEDBACK_COMPLAINT",
    entityId: updated.id,
    action: "UPDATE",
    before,
    after: updated,
  });

  return updated;
}
