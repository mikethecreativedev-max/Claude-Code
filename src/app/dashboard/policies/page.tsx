import Link from "next/link";

import { requireModulePermission } from "@/server/rbac/permissions";
import { getPolicyReviewTracker } from "@/server/policies/service";

const STATUS_BADGE: Record<string, string> = {
  OVERDUE: "bg-red-100 text-red-700",
  DUE_SOON: "bg-amber-100 text-amber-700",
  OK: "bg-green-100 text-green-700",
};

// Policies is a paid-tier module — same tier-gating deviation note as
// src/app/dashboard/risks/page.tsx: requireTier('PAID') wasn't available
// yet (Phase 3 work, parallel worktree), so this is gated via
// requireModulePermission() for now. Revisit once requireTier() merges.
export default async function PoliciesListPage() {
  const session = await requireModulePermission("POLICIES", "view");
  const policies = await getPolicyReviewTracker(session.orgId);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Policies</h1>
        <Link
          href="/dashboard/policies/new"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          New Policy
        </Link>
      </div>

      <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-2">Title</th>
            <th className="px-4 py-2">Site</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Review date</th>
            <th className="px-4 py-2">Review status</th>
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => (
            <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-4 py-2">
                <Link href={`/dashboard/policies/${p.id}`} className="font-medium text-brand-700">
                  {p.title}
                </Link>
                <span className="ml-2 text-xs text-slate-400">v{p.versionNumber}</span>
              </td>
              <td className="px-4 py-2">{p.site.name}</td>
              <td className="px-4 py-2">{p.status}</td>
              <td className="px-4 py-2">{p.reviewDate.toLocaleDateString()}</td>
              <td className="px-4 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[p.reviewStatus]}`}>
                  {p.reviewStatus}
                </span>
              </td>
            </tr>
          ))}
          {policies.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                No policies yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
