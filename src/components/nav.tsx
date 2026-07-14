import Link from "next/link";

import type { NavItem } from "@/server/rbac/nav-config";

export function Nav({ items, userLabel }: { items: NavItem[]; userLabel: string }) {
  return (
    <nav className="flex h-full w-60 flex-col border-r border-slate-200 bg-white p-4">
      <div className="mb-6 text-sm font-semibold text-brand-700">BNCL Compliance</div>
      <ul className="flex-1 space-y-1">
        {items.map((item) => (
          <li key={item.module}>
            <Link
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              {item.label}
            </Link>
          </li>
        ))}
        {/* Notifications has no RolePermission row — it's a personal inbox,
            not an RBAC-gated governance module (see
            src/server/modules/notifications.ts) — so it isn't part of
            NAV_ITEMS above and is available to every authenticated user. */}
        <li>
          <Link
            href="/dashboard/notifications"
            className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            Notifications
          </Link>
        </li>
      </ul>
      <div className="border-t border-slate-200 pt-4 text-xs text-slate-500">{userLabel}</div>
    </nav>
  );
}
