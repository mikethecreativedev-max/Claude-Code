import { getDpaStatus } from "@/server/data-protection/dpa";
import { scopedOrganisation } from "@/server/db/scoped-client";
import { requireModulePermission } from "@/server/rbac/permissions";
import { updateRetentionAction } from "./actions";

export default async function DataProtectionCentrePage() {
  const [session, dpas] = await Promise.all([
    requireModulePermission("ADMIN_DATA_PROTECTION", "view"),
    getDpaStatus(),
  ]);
  const org = await scopedOrganisation(session.orgId).get();

  return (
    <main>
      <h1 className="text-2xl font-semibold">Data Protection Centre</h1>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-slate-600">Data Processing Agreement status</h2>
        {dpas.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No DPA on file for this organisation yet.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {dpas.map((dpa) => (
              <li key={dpa.id}>
                v{dpa.version} — signed {dpa.signedDate.toISOString().slice(0, 10)} by{" "}
                {dpa.signedBy.name} ({dpa.signedBy.email})
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-600">Retention settings</h2>
        {session.role === "OWNER" ? (
          <form action={updateRetentionAction} className="mt-2 flex items-end gap-2">
            <div>
              <label className="block text-xs font-medium">Retention period (months)</label>
              <input
                type="number"
                name="retentionPolicyMonths"
                min={1}
                max={120}
                defaultValue={org?.retentionPolicyMonths ?? undefined}
                className="w-32 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Save
            </button>
          </form>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            Current retention period: {org?.retentionPolicyMonths ?? "not set"} months. Only the
            Owner can change this.
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-600">Data export</h2>
        <p className="mt-2 text-sm text-slate-500">
          Export a JSON snapshot of all of this organisation&apos;s data (Organisation, Sites,
          Users, Data Processing Agreements — and any module data added by later phases).
        </p>
        <a
          href="/api/admin/data-protection/export"
          className="mt-2 inline-block rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Download export (JSON)
        </a>
      </section>
    </main>
  );
}
