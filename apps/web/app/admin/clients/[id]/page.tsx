import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPageHeader, BackfillBadge, ClientStatusBadge, ConnectionStatusBadge } from "@/components/admin/ui";
import { ArchiveClientToggle, ConnectAccountControl, DeleteClientControl, RunSourceNowButton, WooConnectControl } from "@/components/admin/row-actions";
import { BackfillForm, type BackfillSourceRow } from "@/components/admin/backfill-form";
import { Card } from "@/components/ui";
import { getClient, getClientBackfillSummary, getGa4Properties, getGoogleAccounts, getMetaAccounts, getUsers } from "@/lib/admin-store";
import { addDays } from "@/lib/range";
import { getLatestDate } from "@/lib/dashboard-data";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [client, users, googleAccounts, metaAccounts, ga4Properties] = await Promise.all([
    getClient(id),
    getUsers(),
    getGoogleAccounts(),
    getMetaAccounts(),
    getGa4Properties(),
  ]);
  if (!client) notFound();

  const clientUsers = users.filter((u) => u.clientId === client.id);

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
          <ConnectAccountControl
            clientId={client.id}
            platform="google"
            label="Google Ads accounts"
            current={client.google ? { externalId: client.google.customerId, name: client.google.name, status: client.google.status } : null}
            options={googleAccounts.map((a) => ({ externalId: a.customerId, name: a.name, secondary: a.customerId }))}
          />
        </Card>

        <Card title="Meta Ads">
          <ConnectAccountControl
            clientId={client.id}
            platform="meta"
            label="Meta ad accounts"
            current={client.meta ? { externalId: client.meta.accountId, name: client.meta.name, status: client.meta.status } : null}
            options={metaAccounts.map((a) => ({ externalId: a.accountId, name: a.name, secondary: a.accountId }))}
          />
        </Card>

        <Card title="GA4">
          <ConnectAccountControl
            clientId={client.id}
            platform="ga4"
            label="GA4 properties"
            current={client.ga4 ? { externalId: client.ga4.propertyId, name: client.ga4.name, status: client.ga4.status } : null}
            options={ga4Properties.map((p) => ({ externalId: p.propertyId, name: p.name, secondary: p.domain }))}
          />
        </Card>

        <Card title="Store">
          {client.store?.type === "shopify" ? (
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="text-slate-200">Shopify · {client.store.domain}</p>
              </div>
              <ConnectionStatusBadge status={client.store.status} />
            </div>
          ) : (
            <WooConnectControl
              clientId={client.id}
              current={
                client.store?.type === "woocommerce"
                  ? { domain: client.store.domain, includedStatuses: client.store.includedStatuses, status: client.store.status }
                  : null
              }
            />
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
              <div className="mt-3 flex items-center justify-between gap-4">
                <p className="text-xs text-slate-500">
                  Queuing writes day-grain rows to ingest_jobs, tracked per (client, source, date) so it&apos;s
                  resumable. GA4, Meta, and WooCommerce have real processors (buttons on the right); Google Ads and
                  Shopify queue but won&apos;t move until those connectors are built.
                </p>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <RunSourceNowButton clientId={client.id} source="ga4" label="Run GA4 now" disabled={!client.ga4} />
                  <RunSourceNowButton clientId={client.id} source="meta" label="Run Meta now" disabled={!client.meta} />
                  <RunSourceNowButton
                    clientId={client.id}
                    source="woo"
                    label="Run WooCommerce now"
                    disabled={client.store?.type !== "woocommerce"}
                  />
                </div>
              </div>
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
