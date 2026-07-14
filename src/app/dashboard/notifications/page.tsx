import { listNotifications, requireAuthenticatedUser } from "@/server/modules/notifications";
import { markNotificationReadAction } from "./actions";

// Notifications are system-generated and DISTINCT from Notices (a separate
// model — see prisma/schema.prisma and src/server/modules/notifications.ts
// header comment). There is no `NOTIFICATIONS` ModuleName / RolePermission
// row: these are personal inbox items scoped to the owning user, not a
// governance module, so this page is gated on plain authentication rather
// than requireModulePermission().
const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  NOTICE_ACKNOWLEDGEMENT_REQUIRED: "A notice needs your acknowledgement",
  TRAINING_EXPIRING_SOON: "A training record is expiring soon",
};

export default async function NotificationsPage() {
  const session = await requireAuthenticatedUser();
  const notifications = await listNotifications(session);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        System-generated notifications for you personally — distinct from Notices, which are
        organisation-wide announcements you view and acknowledge on the Notices page.
      </p>

      <ul className="mt-6 max-w-2xl divide-y divide-slate-100 rounded-md border border-slate-200">
        {notifications.map((n) => (
          <li key={n.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <p className={n.readStatus ? "text-slate-500" : "font-medium"}>
                {NOTIFICATION_TYPE_LABELS[n.type] ?? n.type}
              </p>
              <p className="text-xs text-slate-400">{n.sentAt.toISOString().slice(0, 19).replace("T", " ")}</p>
            </div>
            {!n.readStatus && (
              <form action={markNotificationReadAction}>
                <input type="hidden" name="id" value={n.id} />
                <button
                  type="submit"
                  className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100"
                >
                  Mark as read
                </button>
              </form>
            )}
          </li>
        ))}
        {notifications.length === 0 && (
          <li className="px-4 py-4 text-sm text-slate-500">No notifications yet.</li>
        )}
      </ul>
    </div>
  );
}
