import { listSites } from "@/server/admin/sites";
import { createSiteAction, updateSiteAction } from "./actions";

export default async function AdminSitesPage() {
  const sites = await listSites();

  return (
    <main>
      <h1 className="text-2xl font-semibold">Sites</h1>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-slate-600">Add a site</h2>
        <form action={createSiteAction} className="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs font-medium">Name</label>
            <input name="name" required className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium">Address</label>
            <input name="address" className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium">Registered activities (comma-separated)</label>
            <input name="registeredActivities" className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium">CQC Location ID</label>
            <input name="cqcLocationId" className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </div>
          <button
            type="submit"
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Add site
          </button>
        </form>
      </section>

      <table className="mt-8 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-2">Name</th>
            <th className="py-2">Address</th>
            <th className="py-2">Registered activities</th>
            <th className="py-2">Rename</th>
          </tr>
        </thead>
        <tbody>
          {sites.map((site) => (
            <tr key={site.id} className="border-b border-slate-100">
              <td className="py-2">{site.name}</td>
              <td className="py-2">{site.address ?? "—"}</td>
              <td className="py-2">{site.registeredActivities.join(", ") || "—"}</td>
              <td className="py-2">
                <form action={updateSiteAction} className="flex items-center gap-2">
                  <input type="hidden" name="siteId" value={site.id} />
                  <input
                    name="name"
                    placeholder="New name"
                    className="w-32 rounded-md border border-slate-300 px-1 py-0.5 text-xs"
                  />
                  <button type="submit" className="text-xs text-brand-600 hover:underline">
                    Save
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
