import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPageHeader, BackfillBadge, ClientStatusBadge, ConnectionStatusBadge } from "@/components/admin/ui";
import { ArchiveClientToggle, DeleteClientControl } from "@/components/admin/row-actions";
import { BackfillForm, type BackfillSourceRow } from "@/components/admin/backfill-form";
import { Card } from "@/components/ui";
import { getClient, getClientBackfillSummary, getUsers } from "@/lib/admin-store";
import { addDays } from "@/lib/range";
import { getLatestDate } from "@/lib/dashboard-data";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  const clientUsers = (await getUsers()).filter((u) => u.clientId === client.id);

  const latestDate = getLatestDate();
  const sourceRows: BackfillSourceRow[] = [
    {
      key: "google",
      label: "Google Ads",
      connected: client.google?.status === "connected",
      connectionNote: client.google?.status === "needs_reauth" ? "needs reauthorization" : undefined,
      status: client.backfill.google.status,
      range: client.backfill.google.range,
    },
    {
      key: "meta",
      label: "Meta Ads",
      connected: client.meta?.status === "connected",
      connectionNote: client.meta?.status === "needs_reauth" ? "needs reauthorization" : undefined,
      status: client.backfill.meta.status,
      range: client.backfill.meta.range,
    },
    {
      key: "ga4",
      label: "GA4",
      connected: client.ga4?.status === "connected",
      connectionNote: client.ga4?.status === "needs_reauth" ? "needs reauthorization" : undefined,
      status: client.backfill.ga4.status,
      range: client.backfill.ga4.range,
    },
    {
      key: "store",
      label: client.store?.type === "woocommerce" ? "WooCommerce" : "Shopify",
      connected: client.store?.status === "connected",
      connectionNote: client.store?.status === "needs_reauth" ? "needs reauthorization" : undefined,
      status: client.backfill.store.status,
      range: client.backfill.store.range,
    },
  ];

  const rangesOnFile = sourceRows.map((s) => s.range).filter((r): r is { start: string; end: string } => r !== null);
  const defaultStart =
    rangesOnFile.length > 0
      ? rangesOnFile.reduce((min, r) => (r.start < min ? r.start : min), rangesOnFile[0]!.start)
      : addDays(latestDate, -89);
  const defaultEnd =
    rangesOnFile.length > 0 ? rangesOnFile.reduce((max, r) => (r.end > max ? r.end : max), rangesOnFile[0]!.end) : latestDate;

  return (
    <>
      <AdminPageHeader
        title={
          <span className="flex items-center gap-2">
            {client.name}
            <ClientStatusBadge status={client.status} />
          </span>
        }
        description={`${client.slug} · ${client.timezone} · ${client.currency}`}
        right={
          <div className="flex items-center gap-3">
            <Link
              href={`/?preview=client&clientId=${client.id}&client=${encodeURIComponent(client.name)}`}
              className="text-sm text-sky-400 hover:underline"
            >
              Preview dashboard →
            </Link>
            <ArchiveClientToggle clientId={client.id} status={client.status} />
          </div>
        }
      />

      {client.status === "archived" ? (
        <div className="mb-4 rounded border border-amber-900/60 bg-amber-950/20 p-3 text-xs text-amber-300">
          Archived{client.archivedAt ? ` on ${client.archivedAt}` : ""}: this client is skipped by daily and backfill
          syncs. All historical data is kept, and its dashboard is still viewable. Unarchive to resume syncing.
        </div>
      ) : null}

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
        <Card
          title="Backfill"
          subtitle="One-time historical pull for a chosen date range. Pick which sources to include: run just Google, just GA4, or any combination."
        >
          <div className="mb-3 flex items-center justify-between">
            <BackfillBadge status={getClientBackfillSummary(client)} />
            <p className="text-xs text-slate-600">Overall, across connected sources</p>
          </div>
          {client.status === "archived" ? (
            <p className="text-sm text-slate-500">Unarchive this client to run a backfill.</p>
          ) : (
            <>
              <BackfillForm
                clientId={client.id}
                sources={sourceRows}
                defaultStart={defaultStart}
                defaultEnd={defaultEnd}
                minDate={addDays(latestDate, -730)}
                maxDate={latestDate}
              />
              <p className="mt-3 text-xs text-slate-500">
                In production this enqueues day-grain jobs per source into the pg-boss queue (jobs/src/backfill.ts)
                and each (client, source, date) outcome is tracked in ingest_jobs so it is resumable.
              </p>
            </>
          )}
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

      <div className="mt-4">
        <Card title="Danger zone" subtitle="Deleting a client is permanent and removes all of its data from the database.">
          <DeleteClientControl clientId={client.id} clientName={client.name} />
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
