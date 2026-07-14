import Link from "next/link";

import { requireModulePermission } from "@/server/rbac/permissions";
import { listCurrentAudits } from "@/server/audits/service";

export default async function AuditsListPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const session = await requireModulePermission("AUDITS", "view");
  const page = searchParams.page ? Number(searchParams.page) : 1;
  const { items, total, pageSize } = await listCurrentAudits(session, { page });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Audits</h1>
        <Link
          href="/dashboard/audits/new"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          New audit
        </Link>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">Site</th>
            <th className="py-2 pr-4">Scheduled</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Six Pillar</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="py-2 pr-4">
                <Link href={`/dashboard/audits/${a.id}`} className="text-brand-700 hover:underline">
                  {a.type}
                </Link>
              </td>
              <td className="py-2 pr-4">{a.site.name}</td>
              <td className="py-2 pr-4">{a.scheduledDate.toISOString().slice(0, 10)}</td>
              <td className="py-2 pr-4">{a.status}</td>
              <td className="py-2 pr-4">{a.sixPillar?.name ?? "—"}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-slate-500">
                No audits yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="mt-4 flex gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/dashboard/audits?page=${p}`}
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
