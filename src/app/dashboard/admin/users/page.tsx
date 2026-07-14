import { listUsers } from "@/server/admin/users";
import {
  changeUserRoleAction,
  disableUserAction,
  inviteUserAction,
  reactivateUserAction,
} from "./actions";

// requireModulePermission("ADMIN_USERS", "view") runs inside listUsers() —
// a session without view access gets a thrown ForbiddenError here, which
// Next renders as an error boundary rather than leaking any user rows. The
// same re-check happens independently, server-side, inside every action in
// ./actions.ts — this page never assumes hiding a button is enough.
export default async function AdminUsersPage() {
  const users = await listUsers();

  return (
    <main>
      <h1 className="text-2xl font-semibold">Users &amp; Roles</h1>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-slate-600">Invite a user</h2>
        <form action={inviteUserAction} className="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs font-medium">Name</label>
            <input name="name" required className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium">Email</label>
            <input
              name="email"
              type="email"
              required
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium">Role</label>
            <select name="role" className="rounded-md border border-slate-300 px-2 py-1 text-sm">
              <option value="STAFF">Staff</option>
              <option value="REGISTERED_MANAGER">Registered Manager</option>
              <option value="OWNER">Owner</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Invite
          </button>
        </form>
        <p className="mt-1 text-xs text-slate-500">
          Granting the Owner role additionally requires ADMIN_USERS &quot;approve&quot; permission
          — Registered Managers and Staff cannot grant Owner, including to themselves.
        </p>
      </section>

      <table className="mt-8 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-2">Name</th>
            <th className="py-2">Email</th>
            <th className="py-2">Role</th>
            <th className="py-2">Status</th>
            <th className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b border-slate-100">
              <td className="py-2">{user.name}</td>
              <td className="py-2">{user.email}</td>
              <td className="py-2">
                <form action={changeUserRoleAction} className="flex items-center gap-2">
                  <input type="hidden" name="userId" value={user.id} />
                  <select name="role" defaultValue={user.role} className="rounded-md border border-slate-300 px-1 py-0.5 text-xs">
                    <option value="STAFF">Staff</option>
                    <option value="REGISTERED_MANAGER">Registered Manager</option>
                    <option value="OWNER">Owner</option>
                  </select>
                  <button type="submit" className="text-xs text-brand-600 hover:underline">
                    Update
                  </button>
                </form>
              </td>
              <td className="py-2">{user.status}</td>
              <td className="py-2">
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
        </tbody>
      </table>
    </main>
  );
}
