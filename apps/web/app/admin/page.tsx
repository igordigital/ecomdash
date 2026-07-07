import Link from "next/link";
import { AdminPageHeader, BackfillBadge, ConnectionStatusBadge } from "@/components/admin/ui";
import { Card } from "@/components/ui";
import { getAgencyIntegrations, getClientBackfillSummary, getClients, getUsers } from "@/lib/admin-store";

export default async function AdminOverviewPage() {
  const [clients, users, integrations] = await Promise.all([getClients(), getUsers(), getAgencyIntegrations()]);
  const staffCount = users.filter((u) => u.role !== "client").length;
  const needsAttention = clients.filter(
    (c) => c.google?.status === "needs_reauth" || c.meta?.status === "needs_reauth" || c.ga4?.status === "needs_reauth",
  );
  const integrationsConnected = [integrations.google.connected, integrations.meta.connected, integrations.ga4.connected].filter(
    Boolean,
  ).length;

  return (
    <>
      <AdminPageHeader
        title="Admin overview"
        description="Multi-tenant control: agency-level platform connections, client onboarding, and user access."
        right={
          <Link href="/admin/clients/new" className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500">
            + New client
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Clients</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">{clients.length}</p>
        </Card>
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Agency connections</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">{integrationsConnected}/3</p>
        </Card>
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Staff users</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">{staffCount}</p>
        </Card>
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Needs reauth</p>
          <p className={`mt-1 text-2xl font-bold ${needsAttention.length > 0 ? "text-amber-400" : "text-slate-100"}`}>
            {needsAttention.length}
          </p>
        </Card>
      </div>

      <div className="mt-6">
        <Card title="Clients" subtitle="Most recently added first.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-4 font-medium">Client</th>
                  <th className="pb-2 pr-4 font-medium">Google</th>
                  <th className="pb-2 pr-4 font-medium">Meta</th>
                  <th className="pb-2 pr-4 font-medium">GA4</th>
                  <th className="pb-2 pr-4 font-medium">Store</th>
                  <th className="pb-2 font-medium">Backfill</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {[...clients]
                  .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
                  .map((c) => (
                    <tr key={c.id} className="text-slate-300">
                      <td className="py-2.5 pr-4">
                        <Link href={`/admin/clients/${c.id}`} className="font-medium text-slate-200 hover:underline">
                          {c.name}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4">
                        <ConnectionStatusBadge status={c.google?.status ?? "not_connected"} />
                      </td>
                      <td className="py-2.5 pr-4">
                        <ConnectionStatusBadge status={c.meta?.status ?? "not_connected"} />
                      </td>
                      <td className="py-2.5 pr-4">
                        <ConnectionStatusBadge status={c.ga4?.status ?? "not_connected"} />
                      </td>
                      <td className="py-2.5 pr-4">
                        <ConnectionStatusBadge status={c.store?.status ?? "not_connected"} />
                      </td>
                      <td className="py-2.5">
                        <BackfillBadge status={getClientBackfillSummary(c)} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
