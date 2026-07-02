import { loadWorkerEnv } from "@ecomdash/core";
import { QUEUES, startBoss, type IngestJobData } from "./queue.js";

/**
 * Long-running worker (Railway). Drains the queue with per-source concurrency.
 * Long backfills and Meta async reports do not fit short-lived edge functions;
 * they run here.
 */
async function main() {
  const env = loadWorkerEnv();
  const boss = await startBoss(env.DATABASE_URL);

  // Per-source concurrency: GA4 kept low to respect per-property quota tokens.
  const concurrency: Record<string, number> = {
    [QUEUES.meta]: 2,
    [QUEUES.googleAds]: 2,
    [QUEUES.ga4]: 1,
    [QUEUES.shopify]: 2,
    [QUEUES.woo]: 2,
  };

  for (const [queue, batchSize] of Object.entries(concurrency)) {
    await boss.work<IngestJobData>(queue, { batchSize }, async (jobs) => {
      for (const job of jobs) {
        // TODO(slice-1): resolve connector by queue, authenticate from
        // client_credentials, extract -> normalize -> upsertRecords, and
        // record the (client, source, date) outcome in ingest_jobs.
        console.log(`[${queue}]`, job.data);
      }
    });
  }

  await boss.work(QUEUES.rebuildMarts, async () => {
    // TODO(slice-1): rebuildMerRolling for the restatement horizon, then
    // rebuild mart_campaign_health, refresh dim_campaign_map, and hit the
    // web app's revalidate endpoint with REVALIDATE_SECRET.
    console.log("[marts.rebuild]");
  });

  console.log("worker started");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
