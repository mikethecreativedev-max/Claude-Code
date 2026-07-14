import { requireAuth } from "@/server/auth/session";
import { getModulePermission } from "@/server/rbac/permissions";
import { NAV_ITEMS } from "@/server/rbac/nav-config";
import { Nav } from "@/components/nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();

  const visibility = await Promise.all(
    NAV_ITEMS.map(async (item) => ({
      item,
      canView: (await getModulePermission(session.role, item.module)).canView,
    }))
  );
  const visibleItems = visibility.filter((v) => v.canView).map((v) => v.item);

  return (
    <div className="flex min-h-screen">
      <Nav items={visibleItems} userLabel={`${session.email} (${session.role})`} />
      <div className="flex-1 p-8">{children}</div>
    </div>
  );
}
