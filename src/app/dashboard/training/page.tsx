import { getModulePermission, requireModulePermission } from "@/server/rbac/permissions";
import { scopedDb } from "@/server/db/scoped-client";
import { listTrainingRecords, EXPIRING_SOON_WINDOW_DAYS } from "@/server/modules/training";
import { listOrgSites, listOrgUsers } from "@/server/org/directory";
import { createTrainingRecordAction } from "./actions";

const STATUS_STYLES: Record<string, string> = {
  VALID: "text-emerald-700",
  EXPIRING_SOON: "text-amber-700",
  EXPIRED: "text-red-700",
};

export default async function TrainingPage() {
  const session = await requireModulePermission("TRAINING", "view");
  const canEdit = (await getModulePermission(session.role, "TRAINING")).canEdit;

  const [records, sites, users] = await Promise.all([
    listTrainingRecords(session),
    listOrgSites(scopedDb(session.orgId)),
    listOrgUsers(scopedDb(session.orgId)),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Staff Training</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Records within {EXPIRING_SOON_WINDOW_DAYS} days of their expiry date are shown as
        &quot;Expiring soon&quot; and produce a Calendar task automatically.
      </p>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2 pr-4">Course</th>
            <th className="py-2 pr-4">Staff member</th>
            <th className="py-2 pr-4">Site</th>
            <th className="py-2 pr-4">Completed</th>
            <th className="py-2 pr-4">Expires</th>
            <th className="py-2 pr-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">{r.courseName}</td>
              <td className="py-2 pr-4">{r.user.name}</td>
              <td className="py-2 pr-4">{r.site.name}</td>
              <td className="py-2 pr-4">{r.completionDate.toISOString().slice(0, 10)}</td>
              <td className="py-2 pr-4">{r.expiryDate ? r.expiryDate.toISOString().slice(0, 10) : "—"}</td>
              <td className={`py-2 pr-4 font-medium ${STATUS_STYLES[r.status] ?? ""}`}>
                {r.status.replace("_", " ")}
              </td>
            </tr>
          ))}
          {records.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-slate-500">
                No training records yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canEdit && (
        <form
          action={createTrainingRecordAction}
          className="mt-8 max-w-lg space-y-3 rounded-md border border-slate-200 p-4"
        >
          <h2 className="text-sm font-semibold">Add training record</h2>
          <div>
            <label className="mb-1 block text-xs font-medium">Staff member</label>
            <select name="userId" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </div>
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
            <label className="mb-1 block text-xs font-medium">Course name</label>
            <input name="courseName" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Completion date</label>
            <input type="date" name="completionDate" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Expiry date (optional)</label>
            <input type="date" name="expiryDate" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Save
          </button>
        </form>
      )}
    </div>
  );
}
