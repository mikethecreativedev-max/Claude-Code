import { listOrgUsers } from "@/server/onboarding/invite";
import { InviteForm } from "./invite-form";

/**
 * Role invite screen. Server component: the initial user list is fetched
 * via listOrgUsers() (src/server/onboarding/invite.ts), which does its own
 * auth -> org -> RBAC gate (requireModulePermission("ADMIN_USERS", "view"))
 * — if that throws, Next.js's default error boundary handles it, same
 * pattern as every other server-rendered page in this app. The invite
 * form itself is a client component that posts to POST /api/invites.
 */
export default async function AdminUsersPage() {
  const users = await listOrgUsers();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Users &amp; roles</h1>
        <p className="mt-1 text-sm text-slate-600">
          Invite team members and manage their role. Invited users stay in{" "}
          <span className="font-medium">INVITED</span> status until they accept their invite.
        </p>
      </div>

      <InviteForm />

      <div className="rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">{u.name}</td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3">{u.role}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium " +
                      (u.status === "ACTIVE"
                        ? "bg-green-100 text-green-800"
                        : u.status === "INVITED"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-700")
                    }
                  >
                    {u.status}
                  </span>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
