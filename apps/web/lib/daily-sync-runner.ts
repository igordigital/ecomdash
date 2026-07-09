/**
 * Shared by scripts/daily-sync.ts (CLI, for local/manual runs) and
 * app/api/cron/daily-sync/route.ts (HTTP endpoint, for the scheduled
 * trigger) so the actual sync logic exists in exactly one place.
 *
 * For every active client's connected sources, queues and processes
 * exactly one day: that client's own "yesterday" (getLatestDate is
 * timezone-aware per client, so this is correct regardless of what time
 * this fires in UTC, as long as it fires late enough that every client's
 * own midnight has already passed).
 *
 * Both callers must await this to completion before their own process/
 * request ends -- this is not fire-and-forget. A killed process mid-sync
 * (a cron container exiting, or a serverless-style request timeout) would
 * leave jobs stuck "running" -- see reclaimStaleRunningJobs in
 * lib/ingest-jobs.ts for the self-healing safety net if that ever happens
 * anyway, but the intent here is to not need it.
 */

import { getDb } from "./db";
import { getClients, type AdminClient } from "./admin-store";
import { getClientTimezone, getLatestDate } from "./dashboard-data";
import { runPendingGa4Jobs } from "./ga4-ingest";
import { runPendingMetaJobs } from "./meta-ingest";
import { runPendingGoogleAdsJobs } from "./google-ads-ingest";
import { runPendingWooJobs } from "./woo-ingest";

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

export interface DailySyncSourceResult {
  client: string;
  source: string;
  date: string;
  succeeded: number;
  failed: number;
  error?: string;
}

async function syncSource(
  client: AdminClient,
  label: string,
  source: string,
  date: string,
  run: () => Promise<{ ok: boolean }[]>,
): Promise<DailySyncSourceResult> {
  try {
    await queueDay(client.id, source, date);
    const results = await run();
    const failed = results.filter((r) => !r.ok).length;
    return { client: client.name, source: label, date, succeeded: results.length - failed, failed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { client: client.name, source: label, date, succeeded: 0, failed: 0, error: message };
  }
}

export interface DailySyncSummary {
  clientsTotal: number;
  clientsProcessed: number;
  results: DailySyncSourceResult[];
}

export async function runDailySync(): Promise<DailySyncSummary> {
  const clients = await getClients();
  const active = clients.filter((c) => c.status === "active");
  const results: DailySyncSourceResult[] = [];

  for (const client of active) {
    const timezone = await getClientTimezone(client.id);
    const date = getLatestDate(timezone);

    if (client.ga4?.status === "connected") {
      results.push(await syncSource(client, "GA4", "ga4", date, () => runPendingGa4Jobs(client.id)));
    }
    if (client.meta?.status === "connected") {
      results.push(await syncSource(client, "Meta", "meta", date, () => runPendingMetaJobs(client.id)));
    }
    if (client.google?.status === "connected") {
      results.push(await syncSource(client, "Google Ads", "google-ads", date, () => runPendingGoogleAdsJobs(client.id)));
    }
    if (client.store?.type === "woocommerce" && client.store.status === "connected") {
      results.push(await syncSource(client, "WooCommerce", "woo", date, () => runPendingWooJobs(client.id)));
    }
    // Google Ads not connected, or store is Shopify: nothing to run yet, matches the rest of this app.
  }

  return { clientsTotal: clients.length, clientsProcessed: active.length, results };
}
