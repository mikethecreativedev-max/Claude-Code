import { z } from "zod";

import { scopedDb } from "@/server/db/scoped-client";
import { requireModulePermission } from "@/server/rbac/permissions";
import type { SessionUser } from "@/server/auth/session";
import { listTrainingRecords } from "@/server/modules/training";

export const createManualCalendarTaskSchema = z.object({
  siteId: z.string().min(1),
  title: z.string().min(1).max(300),
  dueDate: z.coerce.date(),
  assignedToId: z.string().min(1).optional(),
});
export type CreateManualCalendarTaskInput = z.infer<typeof createManualCalendarTaskSchema>;

export async function requireCalendarViewSession(): Promise<SessionUser> {
  return requireModulePermission("CALENDAR", "view");
}

/**
 * Unified calendar: aggregates CalendarTask rows for the org, grouped by
 * due date (a grouped-by-date list view, no calendar UI library needed —
 * see BUILD_CHECKLIST.md Phase 5). CalendarTask rows may originate from
 * Audits/Policy reviews (Phase 4, may not exist in this worktree yet — we
 * don't hard-depend on that code having landed, we just read whatever rows
 * exist), Training expiries (Phase 5, synced below), or Events/manual
 * entries.
 *
 * Before reading, we run the training module's live status-derivation pass
 * so any newly EXPIRING_SOON/EXPIRED training records get a CalendarTask
 * even if the user never visited /dashboard/training directly.
 */
export async function listCalendarTasksGroupedByDate(session: SessionUser) {
  // Idempotent side effect: ensures training-derived tasks are current.
  await listTrainingRecords(session);

  const db = scopedDb(session.orgId);
  const tasks = await db.calendarTask.findMany({
    where: { deletedAt: null },
    orderBy: { dueDate: "asc" },
    include: {
      site: { select: { name: true } },
      assignedTo: { select: { name: true, email: true } },
    },
  });

  const grouped = new Map<string, typeof tasks>();
  for (const task of tasks) {
    const key = task.dueDate.toISOString().slice(0, 10); // YYYY-MM-DD
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(task);
    } else {
      grouped.set(key, [task]);
    }
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items }));
}

export async function createManualCalendarTask(
  session: SessionUser,
  input: { siteId: string; title: string; dueDate: Date; assignedToId?: string }
) {
  const db = scopedDb(session.orgId);

  const site = await db.site.findUnique({ where: { id: input.siteId } });
  if (!site) throw new Error("Site not found in caller's organisation");

  return db.calendarTask.create({
    data: {
      siteId: input.siteId,
      title: input.title,
      dueDate: input.dueDate,
      assignedToId: input.assignedToId,
      linkedModule: "MANUAL",
      status: "PENDING",
    } as never,
  });
}
