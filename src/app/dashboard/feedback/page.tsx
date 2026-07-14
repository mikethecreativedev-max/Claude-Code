import Link from "next/link";

import { getModulePermission, requireModulePermission } from "@/server/rbac/permissions";
import { scopedDb } from "@/server/db/scoped-client";
import { listFeedback } from "@/server/modules/feedback";
import { listOrgSites } from "@/server/org/directory";
import { createFeedbackAction } from "./actions";

export default async function FeedbackPage() {
  const session = await requireModulePermission("FEEDBACK_COMPLAINTS", "view");
  const canEdit = (await getModulePermission(session.role, "FEEDBACK_COMPLAINTS")).canEdit;

  const [complaints, sites] = await Promise.all([
    listFeedback(session),
    listOrgSites(scopedDb(session.orgId)),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Feedback &amp; Complaints</h1>
      <p className="mt-1 text-sm text-slate-600">
        Patient and staff feedback and complaints, with outcome tracking.
      </p>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2 pr-4">Source</th>
            <th className="py-2 pr-4">Category</th>
            <th className="py-2 pr-4">Site</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Created</th>
            <th className="py-2 pr-4" />
          </tr>
        </thead>
        <tbody>
          {complaints.map((c) => (
            <tr key={c.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">{c.source}</td>
              <td className="py-2 pr-4">{c.category}</td>
              <td className="py-2 pr-4">{c.site.name}</td>
              <td className="py-2 pr-4">{c.status}</td>
              <td className="py-2 pr-4">{c.createdAt.toISOString().slice(0, 10)}</td>
              <td className="py-2 pr-4">
                {canEdit && (
                  <Link className="text-brand-600 hover:underline" href={`/dashboard/feedback/${c.id}`}>
                    Edit
                  </Link>
                )}
              </td>
            </tr>
          ))}
          {complaints.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-slate-500">
                No feedback or complaints recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canEdit && (
        <form action={createFeedbackAction} className="mt-8 max-w-lg space-y-3 rounded-md border border-slate-200 p-4">
          <h2 className="text-sm font-semibold">Log new feedback / complaint</h2>
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
            <label className="mb-1 block text-xs font-medium">Source</label>
            <select name="source" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="PATIENT">Patient</option>
              <option value="STAFF">Staff</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Category</label>
            <input name="category" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Description</label>
            <textarea name="description" required rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Outcome (optional)</label>
            <textarea name="outcome" rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Save
          </button>
        </form>
      )}
    </div>
  );
}
