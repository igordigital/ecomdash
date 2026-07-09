/**
 * CLI entry point for local/manual runs of the daily sync. The scheduled
 * production trigger is a tiny Railway cron service hitting
 * app/api/cron/daily-sync instead of running this script directly (see
 * that route's docstring) -- both share the same runDailySync logic in
 * lib/daily-sync-runner.ts.
 */

import { runDailySync } from "../lib/daily-sync-runner";

async function main(): Promise<void> {
  const summary = await runDailySync();
  console.log(`[daily-sync] ${summary.clientsProcessed} of ${summary.clientsTotal} active client(s).`);
  for (const r of summary.results) {
    if (r.error) {
      console.error(`[daily-sync] ${r.client} / ${r.source} / ${r.date} threw: ${r.error}`);
    } else {
      console.log(`[daily-sync] ${r.client} / ${r.source} / ${r.date}: ${r.succeeded} succeeded, ${r.failed} failed`);
    }
  }
  console.log("[daily-sync] Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[daily-sync] Fatal error", err);
    process.exit(1);
  });
