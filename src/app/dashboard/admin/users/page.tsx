import { listUsers } from "@/server/admin/users";
import { changeUserRoleAction, disableUserAction, reactivateUserAction } from "./actions";
import { InviteForm } from "./invite-form";

/**
 * Users & Roles admin page. Combines two flows built in parallel phases:
 * inviting a new user (Phase 2's token-based flow — <InviteForm> posts to
 * POST /api/invites, see src/server/onboarding/invite.ts) and managing an
 * existing user's role/status (Phase 7 — src/server/admin/users.ts).
 *
 * requireModulePermission("ADMIN_USERS", "view") runs inside listUsers() —
 * a session without view access gets a thrown ForbiddenError here, which
 * Next renders as an error boundary rather than leaking any user rows. The
 * same re-check happens independently, server-side, inside every action in
 * ./actions.ts and in the invite API route — this page never assumes
 * hiding a button is enough.
 */
export default async function AdminUsersPage() {
  const users = await listUsers();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Users &amp; roles</h1>
        <p className="mt-1 text-sm text-slate-600">
          Invite team members and manage their role. Invited users stay in{" "}
          <span className="font-medium">INVITED</span> status until they accept their invite.
          Granting the Owner role requires ADMIN_USERS &quot;approve&quot; permission —
          Registered Managers and Staff cannot grant Owner, including to themselves.
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
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">{user.name}</td>
                <td className="px-4 py-3 text-slate-600">{user.email}</td>
                <td className="px-4 py-3">
                  <form action={changeUserRoleAction} className="flex items-center gap-2">
                    <input type="hidden" name="userId" value={user.id} />
                    <select
                      name="role"
                      defaultValue={user.role}
                      className="rounded-md border border-slate-300 px-1 py-0.5 text-xs"
                    >
                      <option value="STAFF">Staff</option>
                      <option value="REGISTERED_MANAGER">Registered Manager</option>
                      <option value="OWNER">Owner</option>
                    </select>
                    <button type="submit" className="text-xs text-brand-600 hover:underline">
                      Update
                    </button>
                  </form>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium " +
                      (user.status === "ACTIVE"
                        ? "bg-green-100 text-green-800"
                        : user.status === "INVITED"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-700")
                    }
                  >
                    {user.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {user.status === "DISABLED" ? (
                    <form action={reactivateUserAction}>
                      <input type="hidden" name="userId" value={user.id} />
                      <button type="submit" className="text-xs text-brand-600 hover:underline">
                        Reactivate
                      </button>
                    </form>
                  ) : (
                    <form action={disableUserAction}>
                      <input type="hidden" name="userId" value={user.id} />
                      <button type="submit" className="text-xs text-red-600 hover:underline">
                        Disable
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
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
