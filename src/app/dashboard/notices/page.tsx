import Link from "next/link";

import { getModulePermission, requireModulePermission } from "@/server/rbac/permissions";
import { scopedDb } from "@/server/db/scoped-client";
import { listVisibleNotices } from "@/server/modules/notices";
import { listOrgSites } from "@/server/org/directory";
import { createNoticeAction } from "./actions";

const NOTICE_TYPE_LABELS: Record<string, string> = {
  INTERNAL_ANNOUNCEMENT: "Internal announcement",
  REGULATORY_UPDATE: "Regulatory update",
  POLICY_CHANGE_ALERT: "Policy change alert",
};

export default async function NoticesPage() {
  const session = await requireModulePermission("NOTICES", "view");
  const canEdit = (await getModulePermission(session.role, "NOTICES")).canEdit;

  const [notices, sites] = await Promise.all([
    listVisibleNotices(session),
    canEdit ? listOrgSites(scopedDb(session.orgId)) : Promise.resolve([]),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Notices</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Announcements and regulatory updates. A <code>SPECIFIC_SITE</code> notice is only ever
        visible to users assigned to that site — the list below is already filtered at the
        database query level, not client-side.
      </p>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2 pr-4">Title</th>
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">Audience</th>
            <th className="py-2 pr-4">Posted</th>
            <th className="py-2 pr-4">Posted by</th>
            <th className="py-2 pr-4">Your status</th>
          </tr>
        </thead>
        <tbody>
          {notices.map((n) => (
            <tr key={n.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">
                <Link className="text-brand-600 hover:underline" href={`/dashboard/notices/${n.id}`}>
                  {n.title}
                </Link>
              </td>
              <td className="py-2 pr-4">{NOTICE_TYPE_LABELS[n.noticeType] ?? n.noticeType}</td>
              <td className="py-2 pr-4">
                {n.audience === "SPECIFIC_SITE" ? `Site: ${n.site?.name ?? "—"}` : n.audience.replace("_", " ")}
              </td>
              <td className="py-2 pr-4">{n.postedDate.toISOString().slice(0, 10)}</td>
              <td className="py-2 pr-4">{n.postedBy.name}</td>
              <td className="py-2 pr-4">
                {n.acknowledgementRequired
                  ? n.acknowledgements.length > 0
                    ? "Acknowledged"
                    : "Not yet acknowledged"
                  : "—"}
              </td>
            </tr>
          ))}
          {notices.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-slate-500">
                No notices visible to you yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canEdit && (
        <form action={createNoticeAction} className="mt-8 max-w-lg space-y-3 rounded-md border border-slate-200 p-4">
          <h2 className="text-sm font-semibold">Post a notice</h2>
          <div>
            <label className="mb-1 block text-xs font-medium">Title</label>
            <input name="title" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Body</label>
            <textarea name="body" required rows={4} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Notice type</label>
            <select name="noticeType" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="INTERNAL_ANNOUNCEMENT">Internal announcement</option>
              <option value="REGULATORY_UPDATE">Regulatory update</option>
              <option value="POLICY_CHANGE_ALERT">Policy change alert</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Audience</label>
            <select name="audience" id="audience" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="ALL_STAFF">All staff</option>
              <option value="MANAGERS_ONLY">Managers only</option>
              <option value="SPECIFIC_SITE">Specific site</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">
              Site (required only for &quot;Specific site&quot; audience)
            </label>
            <select name="siteId" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">—</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" name="acknowledgementRequired" id="acknowledgementRequired" />
            <label htmlFor="acknowledgementRequired" className="text-xs font-medium">
              Require acknowledgement (creates a Notification for each targeted user)
            </label>
          </div>
          <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Post notice
          </button>
        </form>
      )}
    </div>
  );
}
