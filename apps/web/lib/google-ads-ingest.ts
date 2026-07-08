/**
 * Processes queued Google Ads ingest_jobs directly, same "simple" shape as
 * ga4-ingest.ts / meta-ingest.ts / woo-ingest.ts (no separate worker or
 * pg-boss queue). One access token and one account-currency lookup per run,
 * reused across every day in the batch. Grain is campaign + ad_group (no
 * per-ad breakdown at v1, unlike Meta) -- ad_id/ad_name are always "" to
 * satisfy fact_ad_daily's shared conflict key across platforms.
 */

import { getDb } from "./db";
import { getGoogleAdsRefreshToken } from "./admin-store";
import { refreshGoogleAdsAccessToken } from "./google-ads-oauth";
import { reclaimStaleRunningJobs } from "./ingest-jobs";
import { fetchGoogleAdsAccountCurrency, fetchGoogleAdsCampaignReport, type GoogleAdsCampaignReportRow } from "./google-ads-reports";

export interface GoogleAdsJobResult {
  date: string;
  ok: boolean;
  error?: string;
}

async function upsertGoogleAdsDaily(clientId: string, currency: string, date: string, rows: GoogleAdsCampaignReportRow[]): Promise<void> {
  if (rows.length === 0) return;
  const db = getDb();
  await db
    .insertInto("fact_ad_daily")
    .values(
      rows.map((r) => ({
        client_id: clientId,
        date,
        platform: "google" as const,
        campaign_id: r.campaignId,
        campaign_name: r.campaignName,
        adset_id: r.adGroupId,
        adset_name: r.adGroupName,
        ad_id: "",
        ad_name: "",
        spend: r.spend,
        impressions: String(r.impressions),
        clicks: String(r.clicks),
        platform_conversions: r.conversions,
        platform_conv_value: r.conversionValue,
        currency,
        impression_share: r.impressionShare,
      })),
    )
    .onConflict((oc) =>
      oc.columns(["client_id", "date", "platform", "campaign_id", "adset_id", "ad_id"]).doUpdateSet((eb) => ({
        campaign_name: eb.ref("excluded.campaign_name"),
        adset_name: eb.ref("excluded.adset_name"),
        spend: eb.ref("excluded.spend"),
        impressions: eb.ref("excluded.impressions"),
        clicks: eb.ref("excluded.clicks"),
        platform_conversions: eb.ref("excluded.platform_conversions"),
        platform_conv_value: eb.ref("excluded.platform_conv_value"),
        currency: eb.ref("excluded.currency"),
        impression_share: eb.ref("excluded.impression_share"),
        loaded_at: new Date(),
      })),
    )
    .execute();
}

/** Runs every pending Google Ads ingest_jobs row for this client, newest day first, sequentially (one account, respect its quota). */
export async function runPendingGoogleAdsJobs(clientId: string): Promise<GoogleAdsJobResult[]> {
  const db = getDb();

  const cred = await db
    .selectFrom("client_credentials")
    .select("config")
    .where("client_id", "=", clientId)
    .where("source", "=", "google-ads")
    .executeTakeFirst();
  const customerId = (cred?.config as { external_id?: string } | undefined)?.external_id;
  if (!customerId) throw new Error("This client has no Google Ads account connected yet.");

  const refreshToken = await getGoogleAdsRefreshToken();
  if (!refreshToken) throw new Error("Google Ads is not connected at the agency level. Connect it on the Integrations page first.");
  const { accessToken } = await refreshGoogleAdsAccessToken(refreshToken);

  const currency = await fetchGoogleAdsAccountCurrency(accessToken, customerId);

  await reclaimStaleRunningJobs(clientId, "google-ads");

  // Newest first: the days someone is actually looking at (recent) land before deep history,
  // instead of a multi-month backfill delaying "yesterday" until everything before it is done.
  const jobs = await db
    .selectFrom("ingest_jobs")
    .selectAll()
    .where("client_id", "=", clientId)
    .where("source", "=", "google-ads")
    .where("status", "=", "pending")
    .orderBy("date", "desc")
    .execute();

  const results: GoogleAdsJobResult[] = [];
  for (const job of jobs) {
    await db.updateTable("ingest_jobs").set({ status: "running", started_at: new Date(), attempts: job.attempts + 1 }).where("id", "=", job.id).execute();
    try {
      const rows = await fetchGoogleAdsCampaignReport(accessToken, customerId, job.date);
      await upsertGoogleAdsDaily(clientId, currency, job.date, rows);
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
