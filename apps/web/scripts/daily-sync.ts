/**
 * Meant to run once a day as a Railway Cron Job (a separate service from
 * the web app, same repo, custom start command `pnpm --filter @ecomdash/web
 * daily-sync` -- see the setup steps left with this session for the exact
 * Railway dashboard configuration, since deploying that is outside what
 * this script itself can do).
 *
 * For every active client's connected sources, queues and processes
 * exactly one day: that client's own "yesterday" (getLatestDate is
 * timezone-aware per client, so this is correct regardless of what time
 * this cron actually fires in UTC, as long as it fires late enough that
 * every client's own midnight has already passed -- see the schedule note
 * left with this session).
 *
 * Deliberately sequential, not fire-and-forget: a Railway Cron Job's
 * container exits once the start command's process exits, so unlike the
 * web app's UI-triggered "Run X now" (safe to fire-and-forget because the
 * Node process stays alive after the HTTP response), everything here must
 * be awaited to completion before main() returns, or the container would
 * be killed mid-sync -- the exact failure mode from a live incident earlier
 * in this project, now avoided by construction here rather than relying on
 * the stale-job reclaim safety net to clean up after the fact.
 */

import { getDb } from "../lib/db";
import { getClients, type AdminClient } from "../lib/admin-store";
import { getClientTimezone, getLatestDate } from "../lib/dashboard-data";
import { runPendingGa4Jobs } from "../lib/ga4-ingest";
import { runPendingMetaJobs } from "../lib/meta-ingest";
import { runPendingGoogleAdsJobs } from "../lib/google-ads-ingest";
import { runPendingWooJobs } from "../lib/woo-ingest";

async function queueDay(clientId: string, source: string, date: string): Promise<void> {
  await getDb()
    .insertInto("ingest_jobs")
    .values({ client_id: clientId, source, date, kind: "daily", status: "pending" })
    .onConflict((oc) =>
      oc
        .columns(["client_id", "source", "date", "kind"])
        .doUpdateSet({ status: "pending", attempts: 0, last_error: null, started_at: null, finished_at: null }),
    )
    .execute();
}

async function syncSource(client: AdminClient, label: string, source: string, date: string, run: () => Promise<{ ok: boolean }[]>): Promise<void> {
  try {
    await queueDay(client.id, source, date);
    const results = await run();
    const failed = results.filter((r) => !r.ok).length;
    console.log(`[daily-sync] ${client.name} / ${label} / ${date}: ${results.length - failed} succeeded, ${failed} failed`);
  } catch (err) {
    console.error(`[daily-sync] ${client.name} / ${label} / ${date} threw`, err);
  }
}

async function main(): Promise<void> {
  const clients = await getClients();
  const active = clients.filter((c) => c.status === "active");
  console.log(`[daily-sync] Starting: ${active.length} active client(s) of ${clients.length} total.`);

  for (const client of active) {
    const timezone = await getClientTimezone(client.id);
    const date = getLatestDate(timezone);

    if (client.ga4?.status === "connected") {
      await syncSource(client, "GA4", "ga4", date, () => runPendingGa4Jobs(client.id));
    }
    if (client.meta?.status === "connected") {
      await syncSource(client, "Meta", "meta", date, () => runPendingMetaJobs(client.id));
    }
    if (client.google?.status === "connected") {
      await syncSource(client, "Google Ads", "google-ads", date, () => runPendingGoogleAdsJobs(client.id));
    }
    if (client.store?.type === "woocommerce" && client.store.status === "connected") {
      await syncSource(client, "WooCommerce", "woo", date, () => runPendingWooJobs(client.id));
    }
    // Google Ads not connected, or store is Shopify: nothing to run yet, matches the rest of this app.
  }

  console.log(`[daily-sync] Done.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[daily-sync] Fatal error", err);
    process.exit(1);
  });
