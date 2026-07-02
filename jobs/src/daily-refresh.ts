import { loadWorkerEnv, trailingRange, eachDay, toDateKey } from "@ecomdash/core";
import { QUEUES, startBoss } from "./queue.js";

/**
 * Daily refresh enqueuer. Run by cron (GitHub Actions for the first client;
 * pg_cron / pg-boss schedule before multi-client). Enqueues day-grain re-pull
 * jobs over each source's restatement window, then a mart rebuild.
 *
 * Restatement windows: Meta 28d, Google ~28d, GA4 7d, orders 30d.
 */
const WINDOWS: { queue: string; days: number }[] = [
  { queue: QUEUES.meta, days: 28 },
  { queue: QUEUES.googleAds, days: 28 },
  { queue: QUEUES.ga4, days: 7 },
  { queue: QUEUES.shopify, days: 30 },
  { queue: QUEUES.woo, days: 30 },
];

async function main() {
  const env = loadWorkerEnv();
  const boss = await startBoss(env.DATABASE_URL);
  const today = toDateKey(new Date());

  // TODO(slice-1): iterate active clients from dim_client + client_credentials
  // instead of a hardcoded list.
  const clientIds: string[] = [];

  for (const clientId of clientIds) {
    for (const { queue, days } of WINDOWS) {
      for (const date of eachDay(trailingRange(today, days))) {
        await boss.send(queue, { clientId, date, kind: "daily" }, {
          singletonKey: `${queue}:${clientId}:${date}:daily`,
        });
      }
    }
    await boss.send(QUEUES.rebuildMarts, { clientId }, {
      singletonKey: `rebuild:${clientId}:${today}`,
      startAfter: 60 * 10, // let ingestion settle first; replaced by real dependency tracking later
    });
  }

  console.log(`enqueued daily refresh for ${clientIds.length} client(s)`);
  await boss.stop();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
