import { requireModulePermission } from "@/server/rbac/permissions";
import { scopedDb } from "@/server/db/scoped-client";
import { listSixPillars } from "@/server/taxonomy/reference-data";
import { createAuditAction } from "@/app/dashboard/audits/actions";

export default async function NewAuditPage() {
  const session = await requireModulePermission("AUDITS", "edit");

  const [sites, sixPillars] = await Promise.all([
    scopedDb(session.orgId).site.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    listSixPillars(),
  ]);

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-2xl font-semibold">New audit</h1>
      <form action={createAuditAction} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="type">
            Audit type
          </label>
          <input
            id="type"
            name="type"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="e.g. Infection Control Audit"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="siteId">
            Site
          </label>
          <select
            id="siteId"
            name="siteId"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="scheduledDate">
            Scheduled date
          </label>
          <input
            id="scheduledDate"
            name="scheduledDate"
            type="date"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="sixPillarId">
            Six Pillar
          </label>
          <select
            id="sixPillarId"
            name="sixPillarId"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">— None —</option>
            {sixPillars.map((p) => (
              <option key={p.id} value={p.id}>
                {p.description}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Create audit
        </button>
      </form>
    </div>
  );
}
