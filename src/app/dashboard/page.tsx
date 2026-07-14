import { requireAuth } from "@/server/auth/session";
import { getModulePermission } from "@/server/rbac/permissions";
import { getDashboardData } from "@/server/dashboard/data";
import { StatTile } from "@/components/dashboard/stat-tile";
import { ComplianceRing } from "@/components/dashboard/compliance-ring";
import { ModuleDonut } from "@/components/dashboard/module-donut";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { QuickAccess, type QuickAccessLink } from "@/components/dashboard/quick-access";

/**
 * Main dashboard shell (BUILD_CHECKLIST.md Phase 2): live count badges,
 * compliance score ring, stat tiles, donut chart, recent activity feed
 * (AuditLogEntry-driven), quick access panel. All data comes from
 * getDashboardData() (src/server/dashboard/data.ts), which does its own
 * auth -> org -> RBAC gate and reads exclusively through scopedDb(orgId) —
 * this page performs no queries of its own.
 */
export default async function DashboardPage() {
  const session = await requireAuth();
  const data = await getDashboardData();

  const [canEditUsers, canEditSites] = await Promise.all([
    getModulePermission(session.role, "ADMIN_USERS").then((p) => p.canEdit),
    getModulePermission(session.role, "ADMIN_SITES").then((p) => p.canEdit),
  ]);

  const quickLinks: QuickAccessLink[] = [
    canEditUsers && {
      href: "/dashboard/admin/users",
      label: "Invite a team member",
      description: "Add a Registered Manager or Staff member to your organisation.",
    },
    canEditSites && {
      href: "/dashboard/setup-wizard",
      label: "Add another site",
      description: "Register a further site and its regulated activities.",
    },
  ].filter((v): v is QuickAccessLink => Boolean(v));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">
          Signed in as {session.email} ({session.role.replace("_", " ")}).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Sites" value={data.siteCount} />
        <StatTile label="Team members" value={data.userCount} />
        <StatTile
          label="Modules in use"
          value={data.moduleCounts.filter((m) => m.count > 0).length}
        />
        <StatTile
          label="Total records"
          value={data.moduleCounts.reduce((sum, m) => sum + m.count, 0)}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-6 lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Compliance score</h2>
          <ComplianceRing score={data.complianceScore} band={data.complianceBand} />
          <p className="mt-4 text-center text-xs text-slate-400">
            V1 placeholder formula — see README.md &ldquo;Compliance score&rdquo;.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Records by module</h2>
          <ModuleDonut counts={data.moduleCounts} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-6 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Recent activity</h2>
          <ActivityFeed items={data.recentActivity} />
        </div>

        <div className="lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Quick access</h2>
          <QuickAccess links={quickLinks} />
        </div>
      </div>
    </div>
  );
}
