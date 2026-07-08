/**
 * Processes queued GA4 ingest_jobs directly (no separate worker service or
 * pg-boss queue yet, by design: see the "simple" option chosen over the
 * full worker-service approach). One access token is minted per run and
 * reused across every job in the batch rather than per-day, since access
 * tokens are valid for about an hour and refreshing per day would be
 * wasteful for a multi-day backfill.
 */

import { getDb } from "./db";
import { getGa4RefreshToken } from "./admin-store";
import { refreshGa4AccessToken } from "./ga4-oauth";
import { reclaimStaleRunningJobs } from "./ingest-jobs";
import {
  fetchGa4CampaignReport,
  fetchGa4ContentReport,
  fetchGa4TrafficReport,
  type Ga4CampaignReportRow,
  type Ga4ContentReportRow,
  type Ga4TrafficReportRow,
} from "./ga4-reports";

export interface Ga4JobResult {
  date: string;
  ok: boolean;
  error?: string;
}

async function upsertGa4Traffic(clientId: string, rows: Ga4TrafficReportRow[]): Promise<void> {
  if (rows.length === 0) return;
  const db = getDb();
  await db
    .insertInto("fact_ga4_traffic")
    .values(
      rows.map((r) => ({
        client_id: clientId,
        date: r.date,
        channel_group: r.channelGroup,
        source_medium: r.sourceMedium,
        sessions: String(r.sessions),
        engaged_sessions: String(r.engagedSessions),
        engagement_rate: r.engagementRate,
        avg_session_duration: r.avgSessionDuration,
        bounce_rate: r.bounceRate,
        new_users: String(r.newUsers),
        total_users: String(r.totalUsers),
        add_to_carts: String(r.addToCarts),
        transactions: String(r.transactions),
      })),
    )
    .onConflict((oc) =>
      oc.columns(["client_id", "date", "channel_group", "source_medium"]).doUpdateSet((eb) => ({
        sessions: eb.ref("excluded.sessions"),
        engaged_sessions: eb.ref("excluded.engaged_sessions"),
        engagement_rate: eb.ref("excluded.engagement_rate"),
        avg_session_duration: eb.ref("excluded.avg_session_duration"),
        bounce_rate: eb.ref("excluded.bounce_rate"),
        new_users: eb.ref("excluded.new_users"),
        total_users: eb.ref("excluded.total_users"),
        add_to_carts: eb.ref("excluded.add_to_carts"),
        transactions: eb.ref("excluded.transactions"),
        loaded_at: new Date(),
      })),
    )
    .execute();
}

async function upsertGa4Campaign(clientId: string, rows: Ga4CampaignReportRow[]): Promise<void> {
  if (rows.length === 0) return;
  const db = getDb();
  await db
    .insertInto("fact_ga4_campaign")
    .values(
      rows.map((r) => ({
        client_id: clientId,
        date: r.date,
        session_source_medium: r.sourceMedium,
        session_campaign: r.campaign,
        device: r.device,
        sessions: String(r.sessions),
        engaged_sessions: String(r.engagedSessions),
        engagement_rate: r.engagementRate,
        ga4_conversions: r.conversions,
        ga4_revenue: r.revenue,
        add_to_carts: String(r.addToCarts),
      })),
    )
    .onConflict((oc) =>
      oc.columns(["client_id", "date", "session_source_medium", "session_campaign", "device"]).doUpdateSet((eb) => ({
        sessions: eb.ref("excluded.sessions"),
        engaged_sessions: eb.ref("excluded.engaged_sessions"),
        engagement_rate: eb.ref("excluded.engagement_rate"),
        ga4_conversions: eb.ref("excluded.ga4_conversions"),
        ga4_revenue: eb.ref("excluded.ga4_revenue"),
        add_to_carts: eb.ref("excluded.add_to_carts"),
        loaded_at: new Date(),
      })),
    )
    .execute();
}

async function upsertGa4Content(clientId: string, rows: Ga4ContentReportRow[]): Promise<void> {
  if (rows.length === 0) return;
  const db = getDb();
  await db
    .insertInto("fact_ga4_content")
    .values(
      rows.map((r) => ({
        client_id: clientId,
        date: r.date,
        session_source_medium: r.sourceMedium,
        session_campaign: r.campaign,
        session_ad_content: r.content,
        sessions: String(r.sessions),
        engaged_sessions: String(r.engagedSessions),
        engagement_rate: r.engagementRate,
        ga4_conversions: r.conversions,
        ga4_revenue: r.revenue,
        add_to_carts: String(r.addToCarts),
      })),
    )
    .onConflict((oc) =>
      oc.columns(["client_id", "date", "session_source_medium", "session_campaign", "session_ad_content"]).doUpdateSet((eb) => ({
        sessions: eb.ref("excluded.sessions"),
        engaged_sessions: eb.ref("excluded.engaged_sessions"),
        engagement_rate: eb.ref("excluded.engagement_rate"),
        ga4_conversions: eb.ref("excluded.ga4_conversions"),
        ga4_revenue: eb.ref("excluded.ga4_revenue"),
        add_to_carts: eb.ref("excluded.add_to_carts"),
        loaded_at: new Date(),
      })),
    )
    .execute();
}

/** Runs every pending GA4 ingest_jobs row for this client, oldest first, sequentially (one property, respect its quota). */
export async function runPendingGa4Jobs(clientId: string): Promise<Ga4JobResult[]> {
  const db = getDb();

  const cred = await db
    .selectFrom("client_credentials")
    .select("config")
    .where("client_id", "=", clientId)
    .where("source", "=", "ga4")
    .executeTakeFirst();
  const propertyId = (cred?.config as { external_id?: string } | undefined)?.external_id;
  if (!propertyId) throw new Error("This client has no GA4 property connected yet.");

  const refreshToken = await getGa4RefreshToken();
  if (!refreshToken) throw new Error("GA4 is not connected at the agency level. Connect it on the Integrations page first.");
  const { accessToken } = await refreshGa4AccessToken(refreshToken);

  await reclaimStaleRunningJobs(clientId, "ga4");

  // Newest first: the days someone is actually looking at (recent) land before deep history,
  // instead of a multi-month backfill delaying "yesterday" until everything before it is done.
  const jobs = await db
    .selectFrom("ingest_jobs")
    .selectAll()
    .where("client_id", "=", clientId)
    .where("source", "=", "ga4")
    .where("status", "=", "pending")
    .orderBy("date", "desc")
    .execute();

  const results: Ga4JobResult[] = [];
  for (const job of jobs) {
    await db.updateTable("ingest_jobs").set({ status: "running", started_at: new Date(), attempts: job.attempts + 1 }).where("id", "=", job.id).execute();
    try {
      const [traffic, campaign, content] = await Promise.all([
        fetchGa4TrafficReport(accessToken, propertyId, job.date),
        fetchGa4CampaignReport(accessToken, propertyId, job.date),
        fetchGa4ContentReport(accessToken, propertyId, job.date),
      ]);
      await Promise.all([
        upsertGa4Traffic(clientId, traffic),
        upsertGa4Campaign(clientId, campaign),
        upsertGa4Content(clientId, content),
      ]);
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
