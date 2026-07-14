import Link from "next/link";

import { requireModulePermission } from "@/server/rbac/permissions";
import { listCurrentRiskEntries } from "@/server/risks/service";

// Risk Register is a paid-tier module. requireTier('PAID') did not exist
// yet in src/server/rbac/ or src/server/auth/ at the time this was
// written (Phase 3's tier work is in a parallel worktree). Per this
// phase's instructions, we gate via requireModulePermission() (the
// RolePermission-based check) for now — RISK_REGISTER access is already
// role-gated per BUILD_CHECKLIST.md Phase 1's seed. Revisit once Phase 3's
// requireTier() lands and merges: this route should additionally reject
// FREE-tier orgs server-side, not just hide the nav link.
export default async function RisksListPage() {
  const session = await requireModulePermission("RISK_REGISTER", "view");
  const risks = await listCurrentRiskEntries(session.orgId);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Risk Register</h1>
        <div className="flex gap-2">
          <Link
            href="/dashboard/risks/matrix"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Risk Matrix
          </Link>
          <Link
            href="/dashboard/risks/new"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            New Risk Entry
          </Link>
        </div>
      </div>

      <table className="w-full border-collapse overflow-hidden rounded-lg border border-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-2">Title</th>
            <th className="px-4 py-2">Site</th>
            <th className="px-4 py-2">Owner</th>
            <th className="px-4 py-2">Likelihood</th>
            <th className="px-4 py-2">Impact</th>
            <th className="px-4 py-2">Rating</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Review date</th>
          </tr>
        </thead>
        <tbody>
          {risks.map((risk) => (
            <tr key={risk.id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-4 py-2">
                <Link href={`/dashboard/risks/${risk.id}`} className="font-medium text-brand-700">
                  {risk.title}
                </Link>
                <span className="ml-2 text-xs text-slate-400">v{risk.versionNumber}</span>
              </td>
              <td className="px-4 py-2">{risk.site.name}</td>
              <td className="px-4 py-2">{risk.owner.name}</td>
              <td className="px-4 py-2">{risk.likelihood}</td>
              <td className="px-4 py-2">{risk.impact}</td>
              <td className="px-4 py-2 font-semibold">{risk.riskRating}</td>
              <td className="px-4 py-2">{risk.status}</td>
              <td className="px-4 py-2">{risk.reviewDate.toLocaleDateString()}</td>
            </tr>
          ))}
          {risks.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                No risk entries yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
