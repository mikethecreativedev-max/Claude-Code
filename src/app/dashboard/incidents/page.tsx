import Link from "next/link";

import { requireModulePermission } from "@/server/rbac/permissions";
import { listCurrentIncidents } from "@/server/incidents/service";

export default async function IncidentsListPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const session = await requireModulePermission("INCIDENTS", "view");
  const page = searchParams.page ? Number(searchParams.page) : 1;
  const { items, total, pageSize } = await listCurrentIncidents(session, { page });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Incidents</h1>
        <Link
          href="/dashboard/incidents/new"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Report incident
        </Link>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <th className="py-2 pr-4">Date</th>
            <th className="py-2 pr-4">Site</th>
            <th className="py-2 pr-4">Severity</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Notifiable to CQC</th>
            <th className="py-2 pr-4">Reported by</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="py-2 pr-4">
                <Link
                  href={`/dashboard/incidents/${i.id}`}
                  className="text-brand-700 hover:underline"
                >
                  {i.dateTime.toISOString().slice(0, 10)}
                </Link>
              </td>
              <td className="py-2 pr-4">{i.site.name}</td>
              <td className="py-2 pr-4">{i.severityGrading}</td>
              <td className="py-2 pr-4">{i.status}</td>
              <td className="py-2 pr-4">{i.notifiableToCQC ? "Yes" : "No"}</td>
              <td className="py-2 pr-4">{i.reportedBy.name}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-slate-500">
                No incidents recorded.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="mt-4 flex gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((p) => (
            <Link
              key={p}
              href={`/dashboard/incidents?page=${p}`}
              className={`rounded-md border px-3 py-1 ${
                p === page ? "border-brand-600 bg-brand-50" : "border-slate-300"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
