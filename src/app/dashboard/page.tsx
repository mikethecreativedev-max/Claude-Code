import { requireModulePermission } from "@/server/rbac/permissions";

export default async function DashboardPage() {
  const session = await requireModulePermission("DASHBOARD", "view");

  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-sm text-slate-600">
        Signed in as {session.email} ({session.role}). Full dashboard shell (count badges,
        compliance score ring, stat tiles, activity feed) ships in Phase 2 — see
        BUILD_CHECKLIST.md.
      </p>
    </div>
  );
}
