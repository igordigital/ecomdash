import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPageHeader, BackfillBadge, ConnectionStatusBadge } from "@/components/admin/ui";
import { BackfillForm } from "@/components/admin/backfill-form";
import { Card } from "@/components/ui";
import { getClient, getUsers } from "@/lib/admin-store";
import { addDays } from "@/lib/range";
import { getLatestDate } from "@/lib/mock";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getClient(id);
  if (!client) notFound();

  const clientUsers = getUsers().filter((u) => u.clientId === client.id);

  const latestDate = getLatestDate();
  const sources = [
    client.google?.status === "connected" ? "Google Ads" : null,
    client.meta?.status === "connected" ? "Meta" : null,
    client.ga4?.status === "connected" ? "GA4" : null,
    client.store?.status === "connected" ? (client.store.type === "shopify" ? "Shopify" : "WooCommerce") : null,
  ].filter((s): s is string => !!s);

  return (
    <>
      <AdminPageHeader
        title={client.name}
        description={`${client.slug} · ${client.timezone} · ${client.currency}`}
        right={
          <Link href={`/?preview=client&client=${encodeURIComponent(client.name)}`} className="text-sm text-sky-400 hover:underline">
            Preview dashboard →
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Google Ads">
          {client.google ? (
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="text-slate-200">{client.google.name}</p>
                <p className="text-xs text-slate-500">{client.google.customerId}</p>
              </div>
              <ConnectionStatusBadge status={client.google.status} />
            </div>
          ) : (
            <EmptyConnection label="Google Ads account" />
          )}
        </Card>

        <Card title="Meta Ads">
          {client.meta ? (
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="text-slate-200">{client.meta.name}</p>
                <p className="text-xs text-slate-500">{client.meta.accountId}</p>
              </div>
              <ConnectionStatusBadge status={client.meta.status} />
            </div>
          ) : (
            <EmptyConnection label="Meta ad account" />
          )}
        </Card>

        <Card title="GA4">
          {client.ga4 ? (
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="text-slate-200">{client.ga4.name}</p>
                <p className="text-xs text-slate-500">{client.ga4.propertyId}</p>
              </div>
              <ConnectionStatusBadge status={client.ga4.status} />
            </div>
          ) : (
            <EmptyConnection label="GA4 property" />
          )}
        </Card>

        <Card title="Store">
          {client.store ? (
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="text-slate-200">
                  {client.store.type === "shopify" ? "Shopify" : "WooCommerce"} · {client.store.domain}
                </p>
                {client.store.includedStatuses ? (
                  <p className="text-xs text-slate-500">Revenue statuses: {client.store.includedStatuses.join(", ")}</p>
                ) : null}
              </div>
              <ConnectionStatusBadge status={client.store.status} />
            </div>
          ) : (
            <EmptyConnection label="Shopify or WooCommerce store" />
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card title="Backfill" subtitle="One-time historical pull for a chosen date range, day by day, per source.">
          <div className="mb-3 flex items-center justify-between">
            <BackfillBadge status={client.backfillStatus} />
            {client.backfillRange ? (
              <p className="text-xs text-slate-500">
                Last requested range: {client.backfillRange.start} to {client.backfillRange.end}
              </p>
            ) : null}
          </div>
          <BackfillForm
            clientId={client.id}
            sources={sources}
            defaultStart={client.backfillRange?.start ?? addDays(latestDate, -89)}
            defaultEnd={client.backfillRange?.end ?? latestDate}
            minDate={addDays(latestDate, -730)}
            maxDate={latestDate}
            disabled={client.backfillStatus === "queued" || client.backfillStatus === "running"}
          />
          <p className="mt-3 text-xs text-slate-500">
            In production this enqueues day-grain jobs per source into the pg-boss queue (jobs/src/backfill.ts) and
            each (client, source, date) outcome is tracked in ingest_jobs so it is resumable.
          </p>
        </Card>
      </div>

      <div className="mt-4">
        <Card title="Users with access">
          {clientUsers.length > 0 ? (
            <ul className="grid gap-2 text-sm">
              {clientUsers.map((u) => (
                <li key={u.id} className="flex justify-between">
                  <span className="text-slate-200">{u.name}</span>
                  <span className="text-xs text-slate-500">{u.email}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              No client user assigned yet. Assign one from the{" "}
              <Link href="/admin/users" className="text-sky-400 hover:underline">
                Users page
              </Link>
              .
            </p>
          )}
        </Card>
      </div>
    </>
  );
}

function EmptyConnection({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <p className="text-slate-500">No {label} connected.</p>
      <button className="rounded border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-slate-600">
        Connect
      </button>
    </div>
  );
}
