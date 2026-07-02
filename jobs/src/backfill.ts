import { loadWorkerEnv, eachDay } from "@ecomdash/core";
import { QUEUES, startBoss } from "./queue.js";

/**
 * One-time backfill per client per source. Day-by-day is required for GA4
 * (avoids the (other) row-cap bucket and sampling) and convenient everywhere:
 * clean partitions, trivial single-day re-pull, resumable via ingest_jobs.
 *
 * Usage: pnpm backfill -- <clientId> <source> <start> <end>
 */
async function main() {
  const [clientId, source, start, end] = process.argv.slice(2);
  if (!clientId || !source || !start || !end) {
    console.error("usage: pnpm backfill -- <clientId> <meta|google-ads|ga4|shopify|woo> <YYYY-MM-DD> <YYYY-MM-DD>");
    process.exit(1);
  }

  const queue = {
    "meta": QUEUES.meta,
    "google-ads": QUEUES.googleAds,
    "ga4": QUEUES.ga4,
    "shopify": QUEUES.shopify,
    "woo": QUEUES.woo,
  }[source];
  if (!queue) throw new Error(`unknown source: ${source}`);

  const env = loadWorkerEnv();
  const boss = await startBoss(env.DATABASE_URL);

  let count = 0;
  for (const date of eachDay({ start, end })) {
    await boss.send(queue, { clientId, date, kind: "backfill" }, {
      singletonKey: `${queue}:${clientId}:${date}:backfill`,
    });
    count += 1;
  }

  console.log(`enqueued ${count} backfill day(s) for ${source} / ${clientId}`);
  await boss.stop();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
