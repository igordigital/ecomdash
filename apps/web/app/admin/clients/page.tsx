import Link from "next/link";
import { AdminPageHeader, BackfillBadge, ConnectionStatusBadge } from "@/components/admin/ui";
import { Card } from "@/components/ui";
import { getClients } from "@/lib/admin-store";

export default function ClientsPage() {
  const clients = [...getClients()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <>
      <AdminPageHeader
        title="Clients"
        description="Every tenant in the system. Each has its own credentials and RLS scope, shared tables keyed by client_id."
        right={
          <Link href="/admin/clients/new" className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500">
            + New client
          </Link>
        }
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-4 font-medium">Client</th>
                <th className="pb-2 pr-4 font-medium">Timezone</th>
                <th className="pb-2 pr-4 font-medium">Google</th>
                <th className="pb-2 pr-4 font-medium">Meta</th>
                <th className="pb-2 pr-4 font-medium">GA4</th>
                <th className="pb-2 pr-4 font-medium">Store</th>
                <th className="pb-2 font-medium">Backfill</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {clients.map((c) => (
                <tr key={c.id} className="text-slate-300">
                  <td className="py-2.5 pr-4">
                    <Link href={`/admin/clients/${c.id}`} className="font-medium text-slate-200 hover:underline">
                      {c.name}
                    </Link>
                    <p className="text-xs text-slate-500">{c.slug}</p>
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-slate-400">{c.timezone}</td>
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
                    <BackfillBadge status={c.backfillStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
