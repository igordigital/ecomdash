/**
 * Triggered by a tiny Railway cron service whose only job is a scheduled
 * curl to this URL (rather than a second full Railway service running its
 * own copy of the sync script) -- this way the actual sync executes inside
 * the already-running main app, which already has every credential it
 * needs, so the cron service itself only needs one shared secret
 * (CRON_SECRET), not a duplicate of DATABASE_URL/META_APP_SECRET/etc.
 *
 * Safe to run for minutes: Railway runs `next start` as a persistent Node
 * process (not a serverless function with a hard timeout), so awaiting the
 * full sync before responding is fine -- same assumption the rest of this
 * app's background work already relies on.
 */

import { NextResponse, type NextRequest } from "next/server";
import { runDailySync } from "@/lib/daily-sync-runner";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/daily-sync] CRON_SECRET is not configured on this deployment");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runDailySync();
    console.log(`[cron/daily-sync] ${summary.clientsProcessed} of ${summary.clientsTotal} active client(s) processed.`);
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/daily-sync] Fatal error", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
