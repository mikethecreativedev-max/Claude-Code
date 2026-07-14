import { getModulePermission, requireModulePermission } from "@/server/rbac/permissions";
import { scopedDb } from "@/server/db/scoped-client";
import { listCalendarTasksGroupedByDate } from "@/server/modules/calendar";
import { listOrgSites, listOrgUsers } from "@/server/org/directory";
import { createManualCalendarTaskAction } from "./actions";

const LINKED_MODULE_LABELS: Record<string, string> = {
  AUDIT: "Audit",
  POLICY_REVIEW: "Policy review",
  TRAINING: "Training expiry",
  EVENT: "Event",
  MANUAL: "Manual",
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: "text-slate-600",
  DONE: "text-emerald-700",
  OVERDUE: "text-red-700",
};

export default async function CalendarPage() {
  const session = await requireModulePermission("CALENDAR", "view");
  const canEdit = (await getModulePermission(session.role, "CALENDAR")).canEdit;

  const [groups, sites, users] = await Promise.all([
    listCalendarTasksGroupedByDate(session),
    canEdit ? listOrgSites(scopedDb(session.orgId)) : Promise.resolve([]),
    canEdit ? listOrgUsers(scopedDb(session.orgId)) : Promise.resolve([]),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Calendar</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Unified list of scheduled tasks, grouped by due date — aggregates training expiries
        (Phase 5) and, once built, audit/policy review dates and event follow-ups from other
        phases. Visiting this page also re-derives any newly expiring/expired training records
        into this list.
      </p>

      <div className="mt-6 space-y-6">
        {groups.map((group) => (
          <div key={group.date}>
            <h2 className="text-sm font-semibold text-slate-700">{group.date}</h2>
            <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200">
              {group.items.map((task) => (
                <li key={task.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <div>
                    <span className="font-medium">{task.title}</span>{" "}
                    <span className="text-slate-500">
                      ({LINKED_MODULE_LABELS[task.linkedModule] ?? task.linkedModule} · {task.site.name})
                    </span>
                    {task.assignedTo && (
                      <span className="ml-2 text-slate-500">— {task.assignedTo.name}</span>
                    )}
                  </div>
                  <span className={`font-medium ${STATUS_STYLES[task.status] ?? ""}`}>
                    {task.status.replace("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="text-sm text-slate-500">No scheduled tasks yet.</p>
        )}
      </div>

      {canEdit && (
        <form
          action={createManualCalendarTaskAction}
          className="mt-8 max-w-lg space-y-3 rounded-md border border-slate-200 p-4"
        >
          <h2 className="text-sm font-semibold">Add manual task</h2>
          <div>
            <label className="mb-1 block text-xs font-medium">Site</label>
            <select name="siteId" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Title</label>
            <input name="title" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Due date</label>
            <input type="date" name="dueDate" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Assign to (optional)</label>
            <select name="assignedToId" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Add task
          </button>
        </form>
      )}
    </div>
  );
}
