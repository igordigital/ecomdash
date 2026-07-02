import PgBoss from "pg-boss";

/**
 * Postgres job queue (pg-boss). One queue per source so rate limits are
 * enforced per platform: GA4 property quotas, Meta Business-Use-Case limits,
 * Google Ads request pacing. Retries with exponential backoff.
 */

export const QUEUES = {
  meta: "ingest.meta",
  googleAds: "ingest.google-ads",
  ga4: "ingest.ga4",
  shopify: "ingest.shopify",
  woo: "ingest.woo",
  rebuildMarts: "marts.rebuild",
} as const;

export interface IngestJobData {
  clientId: string;
  /** Single day, YYYY-MM-DD. Backfill and refresh both enqueue day-grain jobs. */
  date: string;
  kind: "backfill" | "daily";
}

export async function startBoss(databaseUrl: string): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString: databaseUrl,
    retryLimit: 5,
    retryBackoff: true,
  });
  boss.on("error", (err) => console.error("pg-boss error", err));
  await boss.start();
  for (const queue of Object.values(QUEUES)) {
    await boss.createQueue(queue);
  }
  return boss;
}
