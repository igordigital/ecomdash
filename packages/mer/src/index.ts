import type { Pool } from "pg";

/**
 * MER = store_net_revenue / total_ad_spend_across_platforms (Invariant 2).
 * Numerator comes only from fact_orders (store truth). Denominator sums
 * spend across platforms; spend is additive, conversions are not.
 * Rebuilt after every daily refresh for the trailing restatement horizon.
 */
const WINDOWS = [
  { name: "7d", days: 7 },
  { name: "28d", days: 28 },
] as const;

export async function rebuildMerRolling(
  pool: Pool,
  clientId: string,
  fromDate: string,
  toDate: string,
): Promise<void> {
  for (const w of WINDOWS) {
    await pool.query(
      `
      insert into mart_mer_rolling
        (client_id, date, "window", total_spend_window, store_net_revenue_window, mer)
      select
        $1::uuid,
        d.date_key,
        $4,
        coalesce(s.spend, 0),
        coalesce(r.net_revenue, 0),
        case when coalesce(s.spend, 0) > 0
             then coalesce(r.net_revenue, 0) / s.spend
             else null end
      from dim_date d
      left join lateral (
        select sum(spend) as spend
        from fact_ad_daily f
        where f.client_id = $1
          and f.date between d.date_key - ($5::int - 1) and d.date_key
      ) s on true
      left join lateral (
        select sum(net_revenue) as net_revenue
        from fact_orders o
        where o.client_id = $1
          and o.order_date between d.date_key - ($5::int - 1) and d.date_key
      ) r on true
      where d.date_key between $2::date and $3::date
      on conflict (client_id, date, "window") do update set
        total_spend_window = excluded.total_spend_window,
        store_net_revenue_window = excluded.store_net_revenue_window,
        mer = excluded.mer,
        loaded_at = now()
      `,
      [clientId, fromDate, toDate, w.name, w.days],
    );
  }
}
