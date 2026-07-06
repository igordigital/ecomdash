import { cookies } from "next/headers";
import { AdminPageHeader } from "@/components/admin/ui";
import { InviteUserForm } from "@/components/admin/invite-user-form";
import { ChangePasswordControl } from "@/components/admin/change-password-control";
import { AssignClientSelect, RemoveUserButton } from "@/components/admin/row-actions";
import { Badge, Card } from "@/components/ui";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { canManageStaff, canResetPassword, type StaffRole } from "@/lib/admin-permissions";
import { getClients, getUsers, type Role } from "@/lib/admin-store";

const ROLE_TONE: Record<Role, "info" | "warn" | "neutral"> = {
  admin: "info",
  analyst: "warn",
  client: "neutral",
};

export default async function UsersPage() {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  const role: StaffRole = session?.role === "admin" ? "admin" : "analyst";
  const staffAllowed = canManageStaff(role);
  const users = getUsers();
  const clients = getClients();

  return (
    <>
      <AdminPageHeader
        title="Users"
        description="Admin: full access, manages integrations and staff. Analyst: creates clients and assigns client dashboards. Client: views only their own dashboard, read-only."
      />

      <div className="mb-4">
        <InviteUserForm clients={clients} canInviteStaff={staffAllowed} />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-4 font-medium">Name</th>
                <th className="pb-2 pr-4 font-medium">Email</th>
                <th className="pb-2 pr-4 font-medium">Role</th>
                <th className="pb-2 pr-4 font-medium">Client dashboard</th>
                <th className="pb-2 pr-4 font-medium">Password</th>
                <th className="pb-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {users.map((u) => (
                <tr key={u.id} className="text-slate-300">
                  <td className="py-2.5 pr-4 font-medium text-slate-200">{u.name}</td>
                  <td className="py-2.5 pr-4 text-xs text-slate-400">{u.email}</td>
                  <td className="py-2.5 pr-4">
                    <Badge tone={ROLE_TONE[u.role]}>{u.role[0]!.toUpperCase() + u.role.slice(1)}</Badge>
                  </td>
                  <td className="py-2.5 pr-4">
                    {u.role === "client" ? (
                      <AssignClientSelect userId={u.id} clientId={u.clientId} clients={clients} />
                    ) : (
                      <span className="text-xs text-slate-600">n/a — sees all clients</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4">
                    {canResetPassword(role, u.role) ? (
                      <ChangePasswordControl userId={u.id} />
                    ) : (
                      <span className="text-xs text-slate-700">restricted</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    {u.role === "client" || staffAllowed ? (
                      <RemoveUserButton userId={u.id} />
                    ) : (
                      <span className="text-xs text-slate-700">restricted</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!staffAllowed ? (
          <p className="mt-4 text-xs text-slate-500">
            Signed in as Analyst: admin and analyst accounts are managed by an Admin. You can still invite client
            users, reassign which client dashboard they see, and reset a client's password.
          </p>
        ) : null}
      </Card>
    </>
  );
}
