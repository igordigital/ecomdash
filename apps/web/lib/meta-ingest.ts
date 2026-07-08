/**
 * Processes queued Meta ingest_jobs directly, same "simple" design as
 * lib/ga4-ingest.ts: no separate worker service or pg-boss queue yet. One
 * access token and one account-currency lookup per run, reused across every
 * day in the batch rather than refetched per job.
 */

import { getDb } from "./db";
import { getMetaAccessToken } from "./admin-store";
import { reclaimStaleRunningJobs } from "./ingest-jobs";
import { fetchMetaAdAccountCurrency, fetchMetaAdInsights, type MetaAdInsightRow } from "./meta-reports";

export interface MetaJobResult {
  date: string;
  ok: boolean;
  error?: string;
}

async function upsertMetaAdDaily(clientId: string, currency: string, date: string, rows: MetaAdInsightRow[]): Promise<void> {
  if (rows.length === 0) return;
  const db = getDb();
  await db
    .insertInto("fact_ad_daily")
    .values(
      rows.map((r) => ({
        client_id: clientId,
        date,
        platform: "meta" as const,
        campaign_id: r.campaignId,
        campaign_name: r.campaignName,
        adset_id: r.adsetId,
        adset_name: r.adsetName,
        ad_id: r.adId,
        ad_name: r.adName,
        spend: r.spend,
        impressions: String(r.impressions),
        clicks: String(r.clicks),
        platform_conversions: r.purchases,
        platform_conv_value: r.purchaseValue,
        currency,
        reach: String(r.reach),
        atc: String(r.addToCarts),
        checkouts_initiated: String(r.checkoutsInitiated),
      })),
    )
    .onConflict((oc) =>
      oc.columns(["client_id", "date", "platform", "campaign_id", "adset_id", "ad_id"]).doUpdateSet((eb) => ({
        campaign_name: eb.ref("excluded.campaign_name"),
        adset_name: eb.ref("excluded.adset_name"),
        ad_name: eb.ref("excluded.ad_name"),
        spend: eb.ref("excluded.spend"),
        impressions: eb.ref("excluded.impressions"),
        clicks: eb.ref("excluded.clicks"),
        platform_conversions: eb.ref("excluded.platform_conversions"),
        platform_conv_value: eb.ref("excluded.platform_conv_value"),
        currency: eb.ref("excluded.currency"),
        reach: eb.ref("excluded.reach"),
        atc: eb.ref("excluded.atc"),
        checkouts_initiated: eb.ref("excluded.checkouts_initiated"),
        loaded_at: new Date(),
      })),
    )
    .execute();
}

/** Runs every pending Meta ingest_jobs row for this client, oldest first, sequentially (one ad account, respect its quota). */
export async function runPendingMetaJobs(clientId: string): Promise<MetaJobResult[]> {
  const db = getDb();

  const cred = await db
    .selectFrom("client_credentials")
    .select("config")
    .where("client_id", "=", clientId)
    .where("source", "=", "meta")
    .executeTakeFirst();
  const accountId = (cred?.config as { external_id?: string } | undefined)?.external_id;
  if (!accountId) throw new Error("This client has no Meta ad account connected yet.");

  const accessToken = await getMetaAccessToken();
  if (!accessToken) throw new Error("Meta is not connected at the agency level. Connect it on the Integrations page first.");

  const currency = await fetchMetaAdAccountCurrency(accessToken, accountId);

  await reclaimStaleRunningJobs(clientId, "meta");

  // Newest first: the days someone is actually looking at (recent) land before deep history,
  // instead of a multi-month backfill delaying "yesterday" until everything before it is done.
  const jobs = await db
    .selectFrom("ingest_jobs")
    .selectAll()
    .where("client_id", "=", clientId)
    .where("source", "=", "meta")
    .where("status", "=", "pending")
    .orderBy("date", "desc")
    .execute();

  const results: MetaJobResult[] = [];
  for (const job of jobs) {
    await db.updateTable("ingest_jobs").set({ status: "running", started_at: new Date(), attempts: job.attempts + 1 }).where("id", "=", job.id).execute();
    try {
      const rows = await fetchMetaAdInsights(accessToken, accountId, job.date);
      await upsertMetaAdDaily(clientId, currency, job.date, rows);
      await db.updateTable("ingest_jobs").set({ status: "succeeded", finished_at: new Date() }).where("id", "=", job.id).execute();
      results.push({ date: job.date, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.updateTable("ingest_jobs").set({ status: "failed", finished_at: new Date(), last_error: message.slice(0, 500) }).where("id", "=", job.id).execute();
      results.push({ date: job.date, ok: false, error: message });
    }
  }
  return results;
}
