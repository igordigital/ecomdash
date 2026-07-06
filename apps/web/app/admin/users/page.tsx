import { AdminPageHeader } from "@/components/admin/ui";
import { InviteUserForm } from "@/components/admin/invite-user-form";
import { AssignClientSelect, RemoveUserButton } from "@/components/admin/row-actions";
import { Badge, Card } from "@/components/ui";
import { getDemoRole } from "@/lib/admin-actions";
import { canManageStaff } from "@/lib/admin-permissions";
import { getClients, getUsers, type Role } from "@/lib/admin-store";

const ROLE_TONE: Record<Role, "info" | "warn" | "neutral"> = {
  admin: "info",
  analyst: "warn",
  client: "neutral",
};

export default async function UsersPage() {
  const role = await getDemoRole();
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
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-4 font-medium">Name</th>
                <th className="pb-2 pr-4 font-medium">Email</th>
                <th className="pb-2 pr-4 font-medium">Role</th>
                <th className="pb-2 pr-4 font-medium">Client dashboard</th>
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
                      <span className="text-xs text-slate-600">n/a — {u.role === "admin" ? "sees all clients" : "sees all clients"}</span>
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
            users and reassign which client dashboard they see.
          </p>
        ) : null}
      </Card>
    </>
  );
}
