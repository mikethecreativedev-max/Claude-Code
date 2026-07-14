import { listOrgsForSuperAdmin } from "@/server/bncl-admin/client";

export default async function BnclAdminPage() {
  // requireBnclAdmin() runs inside listOrgsForSuperAdmin() — a non-admin
  // hitting this page directly gets a thrown BnclAdminRequiredError, which
  // Next.js renders as an error boundary rather than leaking any org data.
  const orgs = await listOrgsForSuperAdmin();

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">BNCL Super-Admin — Cross-org overview</h1>
      <p className="mt-2 text-sm">
        <a href="/bncl-admin/qg-hub" className="text-brand-600 hover:underline">
          Manage Q&amp;G Hub content →
        </a>
      </p>
      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-2">Organisation</th>
            <th className="py-2">Tier</th>
            <th className="py-2">Billing status</th>
            <th className="py-2">Users</th>
            <th className="py-2">Sites</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((org) => (
            <tr key={org.id} className="border-b border-slate-100">
              <td className="py-2">{org.name}</td>
              <td className="py-2">{org.subscriptionTier}</td>
              <td className="py-2">{org.billingStatus}</td>
              <td className="py-2">{org._count.users}</td>
              <td className="py-2">{org._count.sites}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
