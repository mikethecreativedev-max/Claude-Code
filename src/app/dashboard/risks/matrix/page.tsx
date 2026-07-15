import Link from "next/link";

import { requireModulePermission } from "@/server/rbac/permissions";
import { getRiskMatrix } from "@/server/risks/service";

const RATING_COLOR = (rating: number) => {
  if (rating >= 15) return "bg-red-100 border-red-300";
  if (rating >= 8) return "bg-amber-100 border-amber-300";
  if (rating >= 3) return "bg-yellow-50 border-yellow-200";
  return "bg-green-50 border-green-200";
};

export default async function RiskMatrixPage() {
  const session = await requireModulePermission("RISK_REGISTER", "view");
  const grid = await getRiskMatrix(session.orgId);

  // grid[likelihood-1][impact-1]; render impact 5..1 as rows (top = high
  // impact) and likelihood 1..5 as columns, the conventional risk-matrix
  // orientation.
  const impactLevels = [5, 4, 3, 2, 1];
  const likelihoodLevels = [1, 2, 3, 4, 5];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Risk Matrix</h1>
        <Link
          href="/dashboard/risks"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Back to Risk Register
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th className="p-2"></th>
              <th className="p-2 text-center text-xs uppercase text-slate-500" colSpan={5}>
                Likelihood &rarr;
              </th>
            </tr>
            <tr>
              <th className="p-2"></th>
              {likelihoodLevels.map((l) => (
                <th key={l} className="w-32 border border-slate-200 p-2 text-center text-xs">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {impactLevels.map((impact) => (
              <tr key={impact}>
                <th className="border border-slate-200 p-2 text-center text-xs">Impact {impact}</th>
                {likelihoodLevels.map((likelihood) => {
                  const cellEntries = grid[likelihood - 1]?.[impact - 1] ?? [];
                  const rating = likelihood * impact;
                  return (
                    <td
                      key={likelihood}
                      className={`h-24 min-w-32 border p-2 align-top text-xs ${RATING_COLOR(rating)}`}
                    >
                      <div className="mb-1 font-semibold text-slate-500">{rating}</div>
                      {cellEntries.map((entry) => (
                        <Link
                          key={entry.id}
                          href={`/dashboard/risks/${entry.id}`}
                          className="mb-1 block truncate rounded bg-white/70 px-1 py-0.5 text-brand-700 hover:underline"
                        >
                          {entry.title}
                        </Link>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
