import type { CanonicalRecord } from "@ecomdash/core";
import type { Pool } from "pg";

/**
 * Centralized loading: upsert by grain, identical restatement behavior for
 * every connector. Connectors never write to the DB directly.
 *
 * Restated facts (Meta/Google/GA4) re-pull a trailing window daily and
 * upsert-replace those date partitions; loaded_at records the last movement.
 */

const GRAIN: Record<CanonicalRecord["table"], string[]> = {
  fact_ad_daily: ["client_id", "date", "platform", "campaign_id", "adset_id", "ad_id"],
  fact_orders: ["client_id", "order_id"],
  fact_ga4_campaign: ["client_id", "date", "session_source_medium", "session_campaign", "device"],
  fact_ga4_traffic: ["client_id", "date", "channel_group", "source_medium"],
};

export async function upsertRecords(pool: Pool, records: CanonicalRecord[]): Promise<number> {
  let written = 0;
  for (const record of records) {
    const conflictCols = GRAIN[record.table];
    const row = record.row as Record<string, unknown>;
    const cols = Object.keys(row);
    const params = cols.map((_, i) => `$${i + 1}`);
    const updates = cols
      .filter((c) => !conflictCols.includes(c))
      .map((c) => `${c} = excluded.${c}`)
      .concat("loaded_at = now()")
      .join(", ");

    await pool.query(
      `insert into ${record.table} (${cols.join(", ")}, loaded_at)
       values (${params.join(", ")}, now())
       on conflict (${conflictCols.join(", ")}) do update set ${updates}`,
      cols.map((c) => row[c]),
    );
    written += 1;
  }
  return written;
}

/**
 * Restatement guard for full-replace semantics: before upserting a re-pulled
 * window, delete rows in the window that the platform no longer reports
 * (e.g. removed ads). Only for restated fact tables, never fact_orders.
 */
export async function deleteWindow(
  pool: Pool,
  table: "fact_ad_daily" | "fact_ga4_campaign" | "fact_ga4_traffic",
  clientId: string,
  start: string,
  end: string,
  extra?: { platform?: "meta" | "google" },
): Promise<void> {
  const clauses = ["client_id = $1", "date >= $2", "date <= $3"];
  const params: unknown[] = [clientId, start, end];
  if (extra?.platform) {
    clauses.push(`platform = $${params.length + 1}`);
    params.push(extra.platform);
  }
  await pool.query(`delete from ${table} where ${clauses.join(" and ")}`, params);
}
