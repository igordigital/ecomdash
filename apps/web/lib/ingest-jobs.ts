import { getDb } from "./db";

const STALE_RUNNING_MINUTES = 15;

/**
 * Reclaims ingest_jobs rows stuck at status='running' because the process
 * that was working on them died mid-run before marking them
 * succeeded/failed (a killed dev server, a Railway deploy restart) -- there
 * is no separate worker or heartbeat, so nothing else ever notices or
 * recovers this on its own. Real per-day processing takes seconds, not
 * minutes, so anything still "running" after STALE_RUNNING_MINUTES is
 * abandoned, not legitimately in progress; resetting it to pending lets the
 * very next run pick it back up instead of it blocking that source's
 * backfill status forever.
 */
export async function reclaimStaleRunningJobs(clientId: string, source: string): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MINUTES * 60_000);
  await getDb()
    .updateTable("ingest_jobs")
    .set({ status: "pending", started_at: null })
    .where("client_id", "=", clientId)
    .where("source", "=", source)
    .where("status", "=", "running")
    .where("started_at", "<", staleBefore)
    .execute();
}
