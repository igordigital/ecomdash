/**
 * Real dashboard data layer, backed by Supabase Postgres (see lib/db.ts).
 * Replaces the old deterministic mock generator: every "get*" function here
 * queries fact_* / dim_* tables directly rather than a pre-built mart,
 * because the nightly mart-rebuild job (mart_mer_rolling,
 * mart_campaign_health) doesn't exist yet. Once it does, getMerSeries /
 * getOverviewKpis / getRollingWindows / getCampaignHealth should switch to
 * reading those marts instead of aggregating fact_ad_daily / fact_orders
 * live on every request. mart_anomalies is the one exception already read
 * directly, since anomaly narratives can only be produced offline.
 *
 * No fact data has been loaded yet (the connectors don't exist), so every
 * query here legitimately returns empty/zero results until the real
 * pipeline lands. Every function keeps the exact signature the old mock.ts
 * had, so page components didn't need structural changes.
 */

import { sql } from "kysely";
import { getDb } from "./db";
import { addDays, previousRange, type ResolvedRange } from "./range";

const num = (v: string | number | null | undefined): number => (v == null ? 0 : Number(v));
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

function sliceByDate<T extends { date: string }>(arr: T[], start: string, end: string): T[] {
  return arr.filter((d) => d.date >= start && d.date <= end);
}

function sparkBounds(end: string, days = 14): { start: string; end: string } {
  return { start: addDays(end, -(days - 1)), end };
}

// ---------------------------------------------------------------------------
// Calendar bounds. Pure date math: latest complete day is always yesterday
// (data lands once daily), independent of whether any data has loaded yet.
// ---------------------------------------------------------------------------
export function getLatestDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function getEarliestDate(): string {
  return addDays(getLatestDate(), -729);
}

// ---------------------------------------------------------------------------
// Blended daily facts (spend + store revenue): the MER inputs
// ---------------------------------------------------------------------------
export interface DailyFact {
  date: string;
  metaSpend: number;
  googleSpend: number;
  revenue: number;
  orders: number;
}

async function fetchDailyFacts(clientId: string, start: string, end: string): Promise<DailyFact[]> {
  const { rows } = await sql<{
    date: string;
    meta_spend: string | null;
    google_spend: string | null;
    revenue: string | null;
    orders: string | null;
  }>`
    with days as (
      select generate_series(${start}::date, ${end}::date, interval '1 day')::date as date
    ),
    spend as (
      select date, platform, sum(spend) as spend
      from fact_ad_daily
      where client_id = ${clientId}::uuid and date between ${start}::date and ${end}::date
      group by date, platform
    ),
    orders as (
      select order_date as date, sum(net_revenue) as revenue, count(*) as orders
      from fact_orders
      where client_id = ${clientId}::uuid and order_date between ${start}::date and ${end}::date
      group by order_date
    )
    select
      days.date::text as date,
      sum(spend.spend) filter (where spend.platform = 'meta') as meta_spend,
      sum(spend.spend) filter (where spend.platform = 'google') as google_spend,
      max(orders.revenue) as revenue,
      max(orders.orders) as orders
    from days
    left join spend on spend.date = days.date
    left join orders on orders.date = days.date
    group by days.date
    order by days.date
  `.execute(getDb());
  return rows.map((r) => ({
    date: r.date,
    metaSpend: r2(num(r.meta_spend)),
    googleSpend: r2(num(r.google_spend)),
    revenue: r2(num(r.revenue)),
    orders: Math.round(num(r.orders)),
  }));
}

function aggBlended(days: DailyFact[]) {
  return days.reduce(
    (s, d) => ({ spend: s.spend + d.metaSpend + d.googleSpend, revenue: s.revenue + d.revenue, orders: s.orders + d.orders }),
    { spend: 0, revenue: 0, orders: 0 },
  );
}

export interface MerPoint {
  date: string;
  metaSpend: number;
  googleSpend: number;
  revenue: number;
  mer: number | null;
}

function rollingMer(daily: DailyFact[], windowDays: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < daily.length; i++) {
    if (i + 1 < windowDays) {
      out.push(null);
      continue;
    }
    let spend = 0;
    let revenue = 0;
    for (let j = i - windowDays + 1; j <= i; j++) {
      spend += daily[j]!.metaSpend + daily[j]!.googleSpend;
      revenue += daily[j]!.revenue;
    }
    out.push(spend > 0 ? r2(revenue / spend) : null);
  }
  return out;
}

/** Trend chart data: MER computed with a rolling window matching the selected range, plotted over that same range. */
export async function getMerSeries(clientId: string, range: ResolvedRange): Promise<MerPoint[]> {
  const extendedStart = addDays(range.start, -(range.days - 1));
  const daily = await fetchDailyFacts(clientId, extendedStart, range.end);
  const merByIndex = rollingMer(daily, range.days);
  const points: MerPoint[] = [];
  daily.forEach((d, i) => {
    if (d.date < range.start || d.date > range.end) return;
    points.push({ date: d.date, metaSpend: d.metaSpend, googleSpend: d.googleSpend, revenue: d.revenue, mer: merByIndex[i] ?? null });
  });
  return points;
}

export const MER_TARGET = 3.0;

export interface OverviewKpis {
  mer: number;
  merPrev: number;
  spend: number;
  spendPrev: number;
  revenue: number;
  revenuePrev: number;
  orders: number;
  ordersPrev: number;
}

export async function getOverviewKpis(clientId: string, range: ResolvedRange): Promise<OverviewKpis> {
  const pr = previousRange(range);
  const daily = await fetchDailyFacts(clientId, pr.start, range.end);
  const cur = aggBlended(sliceByDate(daily, range.start, range.end));
  const prev = aggBlended(sliceByDate(daily, pr.start, pr.end));
  return {
    mer: cur.spend > 0 ? r2(cur.revenue / cur.spend) : 0,
    merPrev: prev.spend > 0 ? r2(prev.revenue / prev.spend) : 0,
    spend: r2(cur.spend),
    spendPrev: r2(prev.spend),
    revenue: r2(cur.revenue),
    revenuePrev: r2(prev.revenue),
    orders: cur.orders,
    ordersPrev: prev.orders,
  };
}

// ---------------------------------------------------------------------------
// Rolling KPIs: fixed 1D / 7D / 30D snapshot, always anchored to yesterday.
// ---------------------------------------------------------------------------
export interface RollingPoint {
  key: "1d" | "7d" | "30d";
  label: string;
  value: number;
  previous: number;
}

export interface RollingWindows {
  mer: RollingPoint[];
  spend: RollingPoint[];
  revenue: RollingPoint[];
  orders: RollingPoint[];
  merSpark: number[];
  spendSpark: number[];
  revenueSpark: number[];
  ordersSpark: number[];
}

const ROLLING_DEFS: { key: "1d" | "7d" | "30d"; label: string; days: number }[] = [
  { key: "1d", label: "1D", days: 1 },
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
];

export async function getRollingWindows(clientId: string): Promise<RollingWindows> {
  const end = getLatestDate();
  const daily = await fetchDailyFacts(clientId, addDays(end, -59), end);
  const mer: RollingPoint[] = [];
  const spend: RollingPoint[] = [];
  const revenue: RollingPoint[] = [];
  const orders: RollingPoint[] = [];
  for (const def of ROLLING_DEFS) {
    const start = addDays(end, -(def.days - 1));
    const prevEnd = addDays(start, -1);
    const prevStart = addDays(prevEnd, -(def.days - 1));
    const cur = aggBlended(sliceByDate(daily, start, end));
    const prev = aggBlended(sliceByDate(daily, prevStart, prevEnd));
    mer.push({
      key: def.key,
      label: def.label,
      value: cur.spend > 0 ? r2(cur.revenue / cur.spend) : 0,
      previous: prev.spend > 0 ? r2(prev.revenue / prev.spend) : 0,
    });
    spend.push({ key: def.key, label: def.label, value: r2(cur.spend), previous: r2(prev.spend) });
    revenue.push({ key: def.key, label: def.label, value: r2(cur.revenue), previous: r2(prev.revenue) });
    orders.push({ key: def.key, label: def.label, value: cur.orders, previous: prev.orders });
  }
  const spark14 = sparkBounds(end);
  const last14 = sliceByDate(daily, spark14.start, spark14.end);
  return {
    mer,
    spend,
    revenue,
    orders,
    merSpark: last14.map((d) => (d.metaSpend + d.googleSpend > 0 ? r2(d.revenue / (d.metaSpend + d.googleSpend)) : 0)),
    spendSpark: last14.map((d) => d.metaSpend + d.googleSpend),
    revenueSpark: last14.map((d) => d.revenue),
    ordersSpark: last14.map((d) => d.orders),
  };
}

// ---------------------------------------------------------------------------
// Network daily series (fact_ad_daily rollups per platform)
// ---------------------------------------------------------------------------
export interface PlatformDay {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  frequency: number;
  atc: number;
  ic: number;
  purchases: number;
  convValue: number;
}

async function fetchPlatformDaily(clientId: string, platform: "meta" | "google", start: string, end: string): Promise<PlatformDay[]> {
  const { rows } = await sql<{
    date: string;
    spend: string | null;
    impressions: string | null;
    clicks: string | null;
    reach: string | null;
    atc: string | null;
    ic: string | null;
    purchases: string | null;
    conv_value: string | null;
  }>`
    with days as (
      select generate_series(${start}::date, ${end}::date, interval '1 day')::date as date
    )
    select
      days.date::text as date,
      sum(f.spend) as spend,
      sum(f.impressions) as impressions,
      sum(f.clicks) as clicks,
      sum(f.reach) as reach,
      sum(f.atc) as atc,
      sum(f.checkouts_initiated) as ic,
      sum(f.platform_conversions) as purchases,
      sum(f.platform_conv_value) as conv_value
    from days
    left join fact_ad_daily f
      on f.date = days.date and f.client_id = ${clientId}::uuid and f.platform = ${platform}
    group by days.date
    order by days.date
  `.execute(getDb());
  return rows.map((r) => {
    const impressions = Math.round(num(r.impressions));
    const reach = Math.round(num(r.reach));
    return {
      date: r.date,
      spend: r2(num(r.spend)),
      impressions,
      clicks: Math.round(num(r.clicks)),
      reach,
      frequency: reach > 0 ? r2(impressions / reach) : 0,
      atc: Math.round(num(r.atc)),
      ic: Math.round(num(r.ic)),
      purchases: Math.round(num(r.purchases)),
      convValue: r2(num(r.conv_value)),
    };
  });
}

export interface NetworkStats {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  atc: number;
  ic: number;
  purchases: number;
  convValue: number;
  cpm: number;
  cpc: number;
  ctr: number;
  frequency: number;
  cpa: number | null;
  roas: number;
  costPerAtc: number | null;
  clickCvr: number;
}

function aggNetwork(days: PlatformDay[]): NetworkStats {
  const sum = days.reduce(
    (s, d) => ({
      spend: s.spend + d.spend,
      impressions: s.impressions + d.impressions,
      clicks: s.clicks + d.clicks,
      reach: s.reach + d.reach,
      atc: s.atc + d.atc,
      ic: s.ic + d.ic,
      purchases: s.purchases + d.purchases,
      convValue: s.convValue + d.convValue,
    }),
    { spend: 0, impressions: 0, clicks: 0, reach: 0, atc: 0, ic: 0, purchases: 0, convValue: 0 },
  );
  return {
    ...sum,
    spend: r2(sum.spend),
    convValue: r2(sum.convValue),
    cpm: sum.impressions > 0 ? r2((sum.spend / sum.impressions) * 1000) : 0,
    cpc: sum.clicks > 0 ? r2(sum.spend / sum.clicks) : 0,
    ctr: sum.impressions > 0 ? r4(sum.clicks / sum.impressions) : 0,
    frequency: days.length > 0 ? r2(days.reduce((s, d) => s + d.frequency, 0) / days.length) : 0,
    cpa: sum.purchases > 0 ? r2(sum.spend / sum.purchases) : null,
    roas: sum.spend > 0 ? r2(sum.convValue / sum.spend) : 0,
    costPerAtc: sum.atc > 0 ? r2(sum.spend / sum.atc) : null,
    clickCvr: sum.clicks > 0 ? r4(sum.purchases / sum.clicks) : 0,
  };
}

export interface NetworkTrendPoint {
  date: string;
  spend: number;
  cpm: number;
  cpc: number;
  ctr: number;
  frequency: number;
  roas: number;
}

export interface NetworkKpis {
  cur: NetworkStats;
  prev: NetworkStats;
  trend: NetworkTrendPoint[];
  sparkSpend: number[];
  sparkCtr: number[];
  sparkCpm: number[];
  sparkRoas: number[];
}

export async function getNetworkKpis(clientId: string, platform: "meta" | "google", range: ResolvedRange): Promise<NetworkKpis> {
  const pr = previousRange(range);
  const sparkWin = sparkBounds(range.end);
  const fetchStart = [pr.start, sparkWin.start].sort()[0]!;
  const daily = await fetchPlatformDaily(clientId, platform, fetchStart, range.end);
  const cur = sliceByDate(daily, range.start, range.end);
  const prev = sliceByDate(daily, pr.start, pr.end);
  const spark = sliceByDate(daily, sparkWin.start, sparkWin.end);
  return {
    cur: aggNetwork(cur),
    prev: aggNetwork(prev),
    trend: cur.map((d) => ({
      date: d.date,
      spend: r2(d.spend),
      cpm: d.impressions > 0 ? r2((d.spend / d.impressions) * 1000) : 0,
      cpc: d.clicks > 0 ? r2(d.spend / d.clicks) : 0,
      ctr: d.impressions > 0 ? r4(d.clicks / d.impressions) : 0,
      frequency: d.frequency,
      roas: d.spend > 0 ? r2(d.convValue / d.spend) : 0,
    })),
    sparkSpend: spark.map((d) => d.spend),
    sparkCtr: spark.map((d) => (d.impressions > 0 ? d.clicks / d.impressions : 0)),
    sparkCpm: spark.map((d) => (d.impressions > 0 ? (d.spend / d.impressions) * 1000 : 0)),
    sparkRoas: spark.map((d) => (d.spend > 0 ? d.convValue / d.spend : 0)),
  };
}

// ---------------------------------------------------------------------------
// Store daily (fact_orders rollups): the source of truth
// ---------------------------------------------------------------------------
export interface StoreDay {
  date: string;
  revenue: number;
  orders: number;
  aov: number;
  refunds: number;
  discountRate: number;
  newShare: number;
}

async function fetchStoreDaily(clientId: string, start: string, end: string): Promise<StoreDay[]> {
  const { rows } = await sql<{
    date: string;
    revenue: string | null;
    orders: string | null;
    refunds: string | null;
    discounts: string | null;
    gross: string | null;
    new_orders: string | null;
  }>`
    with days as (
      select generate_series(${start}::date, ${end}::date, interval '1 day')::date as date
    )
    select
      days.date::text as date,
      sum(o.net_revenue) as revenue,
      count(o.order_id) as orders,
      sum(o.refunds) as refunds,
      sum(o.discounts) as discounts,
      sum(o.gross_revenue) as gross,
      count(o.order_id) filter (where o.customer_type = 'new') as new_orders
    from days
    left join fact_orders o
      on o.order_date = days.date and o.client_id = ${clientId}::uuid
    group by days.date
    order by days.date
  `.execute(getDb());
  return rows.map((r) => {
    const revenue = r2(num(r.revenue));
    const orders = Math.round(num(r.orders));
    const gross = num(r.gross);
    return {
      date: r.date,
      revenue,
      orders,
      aov: orders > 0 ? r2(revenue / orders) : 0,
      refunds: r2(num(r.refunds)),
      discountRate: gross > 0 ? r4(num(r.discounts) / gross) : 0,
      newShare: orders > 0 ? r4(num(r.new_orders) / orders) : 0,
    };
  });
}

export interface StoreStats {
  revenue: number;
  orders: number;
  aov: number;
  refundRate: number;
  discountRate: number;
  newShare: number;
}

function aggStore(days: StoreDay[]): StoreStats {
  const revenue = days.reduce((s, d) => s + d.revenue, 0);
  const orders = days.reduce((s, d) => s + d.orders, 0);
  const refunds = days.reduce((s, d) => s + d.refunds, 0);
  return {
    revenue: r2(revenue),
    orders,
    aov: orders > 0 ? r2(revenue / orders) : 0,
    refundRate: revenue > 0 ? r4(refunds / revenue) : 0,
    discountRate: r4(days.reduce((s, d) => s + d.discountRate, 0) / Math.max(days.length, 1)),
    newShare: r4(days.reduce((s, d) => s + d.newShare, 0) / Math.max(days.length, 1)),
  };
}

export async function getStoreKpis(
  clientId: string,
  range: ResolvedRange,
): Promise<{ cur: StoreStats; prev: StoreStats; daily: StoreDay[] }> {
  const pr = previousRange(range);
  const fetchStart = [range.start, pr.start].sort()[0]!;
  const storeDaily = await fetchStoreDaily(clientId, fetchStart, range.end);
  const daily = sliceByDate(storeDaily, range.start, range.end);
  const cur = aggStore(daily);
  const prev = aggStore(sliceByDate(storeDaily, pr.start, pr.end));
  return { cur, prev, daily };
}

// ---------------------------------------------------------------------------
// Top products (fact_order_items x dim_product)
// ---------------------------------------------------------------------------
export interface Product {
  name: string;
  sku: string;
  units: number;
  revenue: number;
  price: number;
  stock: "in_stock" | "low_stock" | "out_of_stock";
  deltaPct: number;
}

async function fetchProductRevenue(clientId: string, start: string, end: string): Promise<Map<string, { units: number; revenue: number }>> {
  const { rows } = await sql<{ sku: string; units: string | null; revenue: string | null }>`
    select sku, sum(units) as units, sum(revenue) as revenue
    from fact_order_items
    where client_id = ${clientId}::uuid and order_date between ${start}::date and ${end}::date
    group by sku
  `.execute(getDb());
  return new Map(rows.map((r) => [r.sku, { units: Math.round(num(r.units)), revenue: r2(num(r.revenue)) }]));
}

export async function getTopProducts(clientId: string, range: ResolvedRange): Promise<Product[]> {
  const pr = previousRange(range);
  const [products, cur, prev] = await Promise.all([
    sql<{ sku: string; name: string; price: string | null; stock_status: Product["stock"] | null }>`
      select sku, name, price, stock_status from dim_product where client_id = ${clientId}::uuid
    `.execute(getDb()),
    fetchProductRevenue(clientId, range.start, range.end),
    fetchProductRevenue(clientId, pr.start, pr.end),
  ]);
  return products.rows
    .map((p) => {
      const c = cur.get(p.sku) ?? { units: 0, revenue: 0 };
      const before = prev.get(p.sku) ?? { units: 0, revenue: 0 };
      const deltaPct = before.revenue > 0 ? r4((c.revenue - before.revenue) / before.revenue) : 0;
      return {
        name: p.name,
        sku: p.sku,
        units: c.units,
        revenue: c.revenue,
        price: num(p.price),
        stock: p.stock_status ?? "in_stock",
        deltaPct,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

// ---------------------------------------------------------------------------
// Funnels (fact_ga4_traffic + fact_ga4_funnel + fact_orders)
// ---------------------------------------------------------------------------
export interface FunnelStage {
  label: string;
  value: number;
  prev: number;
}

async function siteFunnelStage(clientId: string, start: string, end: string) {
  const { rows } = await sql<{ sessions: string | null; atc: string | null; checkout: string | null; orders: string | null }>`
    select
      (select coalesce(sum(sessions), 0) from fact_ga4_traffic where client_id = ${clientId}::uuid and date between ${start}::date and ${end}::date) as sessions,
      (select coalesce(sum(add_to_carts), 0) from fact_ga4_funnel where client_id = ${clientId}::uuid and date between ${start}::date and ${end}::date) as atc,
      (select coalesce(sum(checkouts), 0) from fact_ga4_funnel where client_id = ${clientId}::uuid and date between ${start}::date and ${end}::date) as checkout,
      (select count(*) from fact_orders where client_id = ${clientId}::uuid and order_date between ${start}::date and ${end}::date) as orders
  `.execute(getDb());
  const r = rows[0]!;
  return { sessions: num(r.sessions), atc: num(r.atc), checkout: num(r.checkout), orders: num(r.orders) };
}

export async function getSiteFunnel(clientId: string, range: ResolvedRange): Promise<FunnelStage[]> {
  const pr = previousRange(range);
  const [cur, prev] = await Promise.all([
    siteFunnelStage(clientId, range.start, range.end),
    siteFunnelStage(clientId, pr.start, pr.end),
  ]);
  return [
    { label: "Sessions", value: cur.sessions, prev: prev.sessions },
    { label: "Add to cart", value: cur.atc, prev: prev.atc },
    { label: "Checkout started", value: cur.checkout, prev: prev.checkout },
    { label: "Orders", value: cur.orders, prev: prev.orders },
  ];
}

export async function getNetworkFunnel(clientId: string, platform: "meta" | "google", range: ResolvedRange): Promise<FunnelStage[]> {
  const pr = previousRange(range);
  const fetchStart = [range.start, pr.start].sort()[0]!;
  const daily = await fetchPlatformDaily(clientId, platform, fetchStart, range.end);
  const cur = aggNetwork(sliceByDate(daily, range.start, range.end));
  const prev = aggNetwork(sliceByDate(daily, pr.start, pr.end));
  return [
    { label: "Impressions", value: cur.impressions, prev: prev.impressions },
    { label: "Link clicks", value: cur.clicks, prev: prev.clicks },
    { label: "Add to cart", value: cur.atc, prev: prev.atc },
    { label: "Checkout initiated", value: cur.ic, prev: prev.ic },
    { label: "Purchases", value: cur.purchases, prev: prev.purchases },
  ];
}

export interface FunnelTrendPoint {
  date: string;
  cvr: number;
  abandonment: number;
}

export async function getFunnelTrend(clientId: string, range: ResolvedRange): Promise<FunnelTrendPoint[]> {
  const { rows } = await sql<{ date: string; sessions: string | null; atc: string | null; orders: string | null }>`
    with days as (
      select generate_series(${range.start}::date, ${range.end}::date, interval '1 day')::date as date
    ),
    traffic as (
      select date, sum(sessions) as sessions from fact_ga4_traffic
      where client_id = ${clientId}::uuid and date between ${range.start}::date and ${range.end}::date
      group by date
    ),
    funnel as (
      select date, sum(add_to_carts) as atc from fact_ga4_funnel
      where client_id = ${clientId}::uuid and date between ${range.start}::date and ${range.end}::date
      group by date
    ),
    orders as (
      select order_date as date, count(*) as orders from fact_orders
      where client_id = ${clientId}::uuid and order_date between ${range.start}::date and ${range.end}::date
      group by order_date
    )
    select days.date::text as date, traffic.sessions, funnel.atc, orders.orders
    from days
    left join traffic on traffic.date = days.date
    left join funnel on funnel.date = days.date
    left join orders on orders.date = days.date
    order by days.date
  `.execute(getDb());
  return rows.map((r) => {
    const sessions = num(r.sessions);
    const atc = num(r.atc);
    const orders = num(r.orders);
    return {
      date: r.date,
      cvr: sessions > 0 ? r4(orders / sessions) : 0,
      abandonment: atc > 0 ? r4(Math.max(0, 1 - orders / atc)) : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Campaign health (fact_ad_daily x dim_campaign_map, live-aggregated)
// ---------------------------------------------------------------------------
export type Health = "scaling" | "healthy" | "watch" | "fatigued" | "inefficient";

export interface CampaignHealth {
  platform: "meta" | "google";
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  platformRoas: number;
  ga4Sessions: number | null;
  ga4EngagementRate: number | null;
  utmMatched: boolean;
  health: Health;
}

function classifyHealth(roasNow: number, roasPrev: number, spendNow: number, spendPrev: number): Health {
  if (roasNow <= 0.5) return "inefficient";
  const spendGrowth = spendPrev > 0 ? (spendNow - spendPrev) / spendPrev : spendNow > 0 ? 1 : 0;
  const roasChange = roasPrev > 0 ? (roasNow - roasPrev) / roasPrev : 0;
  if (spendGrowth > 0.25 && roasChange >= -0.1) return "scaling";
  if (roasChange <= -0.2) return "fatigued";
  if (roasChange <= -0.08) return "watch";
  return "healthy";
}

interface CampaignAgg {
  platform: "meta" | "google";
  campaignId: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  convValue: number;
  utmCampaign: string | null;
}

async function fetchCampaignAgg(clientId: string, start: string, end: string): Promise<CampaignAgg[]> {
  const { rows } = await sql<{
    platform: "meta" | "google";
    campaign_id: string;
    campaign_name: string;
    spend: string | null;
    impressions: string | null;
    clicks: string | null;
    conv_value: string | null;
    utm_campaign: string | null;
  }>`
    select
      f.platform,
      f.campaign_id,
      max(f.campaign_name) as campaign_name,
      sum(f.spend) as spend,
      sum(f.impressions) as impressions,
      sum(f.clicks) as clicks,
      sum(f.platform_conv_value) as conv_value,
      max(m.utm_campaign) as utm_campaign
    from fact_ad_daily f
    left join dim_campaign_map m
      on m.client_id = f.client_id and m.platform = f.platform and m.platform_campaign_id = f.campaign_id
    where f.client_id = ${clientId}::uuid and f.date between ${start}::date and ${end}::date
    group by f.platform, f.campaign_id
  `.execute(getDb());
  return rows.map((r) => ({
    platform: r.platform,
    campaignId: r.campaign_id,
    name: r.campaign_name,
    spend: r2(num(r.spend)),
    impressions: Math.round(num(r.impressions)),
    clicks: Math.round(num(r.clicks)),
    convValue: r2(num(r.conv_value)),
    utmCampaign: r.utm_campaign,
  }));
}

async function fetchGa4ByCampaign(clientId: string, start: string, end: string): Promise<Map<string, { sessions: number; engaged: number }>> {
  const { rows } = await sql<{ session_campaign: string; sessions: string | null; engaged: string | null }>`
    select session_campaign, sum(sessions) as sessions, sum(engaged_sessions) as engaged
    from fact_ga4_campaign
    where client_id = ${clientId}::uuid and date between ${start}::date and ${end}::date
    group by session_campaign
  `.execute(getDb());
  return new Map(rows.map((r) => [r.session_campaign, { sessions: num(r.sessions), engaged: num(r.engaged) }]));
}

export async function getCampaignHealth(clientId: string, range: ResolvedRange): Promise<CampaignHealth[]> {
  const pr = previousRange(range);
  const [cur, prev, ga4] = await Promise.all([
    fetchCampaignAgg(clientId, range.start, range.end),
    fetchCampaignAgg(clientId, pr.start, pr.end),
    fetchGa4ByCampaign(clientId, range.start, range.end),
  ]);
  const prevByKey = new Map(prev.map((c) => [`${c.platform}:${c.campaignId}`, c]));
  const rows = cur.map((c) => {
    const roasNow = c.spend > 0 ? c.convValue / c.spend : 0;
    const before = prevByKey.get(`${c.platform}:${c.campaignId}`);
    const roasPrev = before && before.spend > 0 ? before.convValue / before.spend : 0;
    const ga4Row = c.utmCampaign ? ga4.get(c.utmCampaign) : undefined;
    return {
      platform: c.platform,
      name: c.name,
      spend: c.spend,
      impressions: c.impressions,
      clicks: c.clicks,
      platformRoas: r2(roasNow),
      ga4Sessions: ga4Row ? Math.round(ga4Row.sessions) : null,
      ga4EngagementRate: ga4Row && ga4Row.sessions > 0 ? r4(ga4Row.engaged / ga4Row.sessions) : null,
      utmMatched: c.utmCampaign !== null,
      health: classifyHealth(roasNow, roasPrev, c.spend, before?.spend ?? 0),
    };
  });
  return rows.sort((a, b) => b.spend - a.spend);
}

export async function getUtmMatchRate(clientId: string, range: ResolvedRange): Promise<number> {
  const meta = (await getCampaignHealth(clientId, range)).filter((c) => c.platform === "meta");
  const total = meta.reduce((s, c) => s + c.spend, 0);
  const matched = meta.filter((c) => c.utmMatched).reduce((s, c) => s + c.spend, 0);
  return total > 0 ? matched / total : 0;
}

// ---------------------------------------------------------------------------
// Meta ad-level drill-down + creative breakdown (fact_ad_daily, ad grain)
// ---------------------------------------------------------------------------
export type CreativeType = "UGC video" | "Brand video" | "Static" | "Carousel" | "DPA";

export interface MetaAd {
  campaign: string;
  adset: string;
  name: string;
  type: CreativeType;
  status: "ACTIVE" | "PAUSED";
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  convValue: number;
  frequency: number;
}

export async function getMetaAds(clientId: string, range: ResolvedRange): Promise<MetaAd[]> {
  const { rows } = await sql<{
    campaign_name: string;
    adset_name: string;
    ad_name: string;
    creative_type: CreativeType | null;
    spend: string | null;
    impressions: string | null;
    clicks: string | null;
    purchases: string | null;
    conv_value: string | null;
    reach: string | null;
  }>`
    select
      campaign_name, adset_name, ad_name, creative_type,
      sum(spend) as spend, sum(impressions) as impressions, sum(clicks) as clicks,
      sum(platform_conversions) as purchases, sum(platform_conv_value) as conv_value, sum(reach) as reach
    from fact_ad_daily
    where client_id = ${clientId}::uuid and platform = 'meta' and date between ${range.start}::date and ${range.end}::date
    group by campaign_name, adset_name, ad_name, creative_type
  `.execute(getDb());
  return rows
    .map((r) => {
      const impressions = Math.round(num(r.impressions));
      const reach = Math.round(num(r.reach));
      return {
        campaign: r.campaign_name,
        adset: r.adset_name,
        name: r.ad_name,
        type: r.creative_type ?? "Static",
        status: "ACTIVE" as const,
        spend: r2(num(r.spend)),
        impressions,
        clicks: Math.round(num(r.clicks)),
        purchases: Math.round(num(r.purchases)),
        convValue: r2(num(r.conv_value)),
        frequency: reach > 0 ? r2(impressions / reach) : 0,
      };
    })
    .sort((a, b) => b.spend - a.spend);
}

export interface CreativeSlice {
  type: CreativeType;
  spend: number;
  share: number;
  purchases: number;
  roas: number;
  ctr: number;
}

export async function getCreativeBreakdown(clientId: string, range: ResolvedRange): Promise<CreativeSlice[]> {
  const ads = await getMetaAds(clientId, range);
  const total = ads.reduce((s, a) => s + a.spend, 0);
  const byType = new Map<CreativeType, { spend: number; purchases: number; convValue: number; clicks: number; impressions: number }>();
  for (const ad of ads) {
    const t = byType.get(ad.type) ?? { spend: 0, purchases: 0, convValue: 0, clicks: 0, impressions: 0 };
    t.spend += ad.spend;
    t.purchases += ad.purchases;
    t.convValue += ad.convValue;
    t.clicks += ad.clicks;
    t.impressions += ad.impressions;
    byType.set(ad.type, t);
  }
  return [...byType.entries()]
    .map(([type, t]) => ({
      type,
      spend: t.spend,
      share: total > 0 ? t.spend / total : 0,
      purchases: t.purchases,
      roas: t.spend > 0 ? r2(t.convValue / t.spend) : 0,
      ctr: t.impressions > 0 ? r4(t.clicks / t.impressions) : 0,
    }))
    .sort((a, b) => b.spend - a.spend);
}

// ---------------------------------------------------------------------------
// Google campaign table (campaign + ad_group grain at v1)
// ---------------------------------------------------------------------------
export interface GoogleCampaign {
  name: string;
  type: "Search" | "Performance Max" | "Shopping";
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  convValue: number;
  impressionShare: number | null;
  health: Health;
}

export async function getGoogleCampaigns(clientId: string, range: ResolvedRange): Promise<GoogleCampaign[]> {
  const pr = previousRange(range);
  const { rows } = await sql<{
    campaign_name: string;
    campaign_type: GoogleCampaign["type"] | null;
    spend: string | null;
    impressions: string | null;
    clicks: string | null;
    conversions: string | null;
    conv_value: string | null;
    impression_share: string | null;
  }>`
    select
      f.campaign_name,
      max(m.campaign_type) as campaign_type,
      sum(f.spend) as spend,
      sum(f.impressions) as impressions,
      sum(f.clicks) as clicks,
      sum(f.platform_conversions) as conversions,
      sum(f.platform_conv_value) as conv_value,
      avg(f.impression_share) as impression_share
    from fact_ad_daily f
    left join dim_campaign_map m
      on m.client_id = f.client_id and m.platform = f.platform and m.platform_campaign_id = f.campaign_id
    where f.client_id = ${clientId}::uuid and f.platform = 'google' and f.date between ${range.start}::date and ${range.end}::date
    group by f.campaign_name
  `.execute(getDb());
  const prevAgg = await fetchCampaignAgg(clientId, pr.start, pr.end);
  const prevByName = new Map(prevAgg.filter((c) => c.platform === "google").map((c) => [c.name, c]));
  return rows
    .map((r) => {
      const spend = r2(num(r.spend));
      const convValue = r2(num(r.conv_value));
      const roasNow = spend > 0 ? convValue / spend : 0;
      const before = prevByName.get(r.campaign_name);
      const roasPrev = before && before.spend > 0 ? before.convValue / before.spend : 0;
      return {
        name: r.campaign_name,
        type: r.campaign_type ?? "Search",
        spend,
        impressions: Math.round(num(r.impressions)),
        clicks: Math.round(num(r.clicks)),
        conversions: Math.round(num(r.conversions)),
        convValue,
        impressionShare: r.impression_share !== null ? r4(num(r.impression_share)) : null,
        health: classifyHealth(roasNow, roasPrev, spend, before?.spend ?? 0),
      };
    })
    .sort((a, b) => b.spend - a.spend);
}

// ---------------------------------------------------------------------------
// Site traffic health (fact_ga4_traffic; no crosswalk needed)
// ---------------------------------------------------------------------------
export const CHANNELS = ["Organic Search", "Paid Social", "Paid Search", "Direct", "Email", "Referral"] as const;

export interface TrafficDay {
  date: string;
  [channel: string]: number | string;
}

export async function getTrafficSeries(clientId: string, range: ResolvedRange): Promise<TrafficDay[]> {
  const { rows } = await sql<{ date: string; channel_group: string; sessions: string | null }>`
    select date::text as date, channel_group, sum(sessions) as sessions
    from fact_ga4_traffic
    where client_id = ${clientId}::uuid and date between ${range.start}::date and ${range.end}::date
    group by date, channel_group
  `.execute(getDb());
  const byDate = new Map<string, TrafficDay>();
  const { start, end } = range;
  let d = start;
  while (d <= end) {
    byDate.set(d, { date: d, ...Object.fromEntries(CHANNELS.map((c) => [c, 0])) });
    d = addDays(d, 1);
  }
  for (const r of rows) {
    const row = byDate.get(r.date);
    if (row) row[r.channel_group] = Math.round(num(r.sessions));
  }
  return [...byDate.values()];
}

export interface ChannelSummary {
  channel: string;
  sessions: number;
  engagementRate: number;
  avgSessionDuration: number;
  bounceRate: number;
  newUserShare: number;
}

export async function getChannelSummaries(clientId: string, range: ResolvedRange): Promise<ChannelSummary[]> {
  const { rows } = await sql<{
    channel_group: string;
    sessions: string | null;
    engaged: string | null;
    duration: string | null;
    bounce: string | null;
    new_users: string | null;
    total_users: string | null;
  }>`
    select
      channel_group,
      sum(sessions) as sessions,
      sum(engaged_sessions) as engaged,
      sum(avg_session_duration * sessions) as duration,
      sum(bounce_rate * sessions) as bounce,
      sum(new_users) as new_users,
      sum(total_users) as total_users
    from fact_ga4_traffic
    where client_id = ${clientId}::uuid and date between ${range.start}::date and ${range.end}::date
    group by channel_group
  `.execute(getDb());
  const byChannel = new Map(rows.map((r) => [r.channel_group, r]));
  return CHANNELS.map((channel) => {
    const r = byChannel.get(channel);
    const sessions = num(r?.sessions);
    return {
      channel,
      sessions: Math.round(sessions),
      engagementRate: sessions > 0 ? r4(num(r?.engaged) / sessions) : 0,
      avgSessionDuration: sessions > 0 ? r2(num(r?.duration) / sessions) : 0,
      bounceRate: sessions > 0 ? r4(num(r?.bounce) / sessions) : 0,
      newUserShare: num(r?.total_users) > 0 ? r4(num(r?.new_users) / num(r?.total_users)) : 0,
    };
  }).sort((a, b) => b.sessions - a.sessions);
}

// ---------------------------------------------------------------------------
// Campaign and content (ad) level traffic, with GA4 ecommerce metrics
// (fact_ga4_campaign / fact_ga4_content: DIAGNOSTIC ONLY, never store revenue)
// ---------------------------------------------------------------------------
export interface CampaignTraffic {
  campaign: string;
  platform: "meta" | "google" | null;
  channelGroup: string;
  sessions: number | null;
  engagedSessions: number | null;
  engagementRate: number | null;
  transactions: number;
  revenue: number;
  aov: number;
  utmMatched: boolean;
}

export async function getCampaignTraffic(clientId: string, range: ResolvedRange): Promise<CampaignTraffic[]> {
  const [campaigns, ga4Rows] = await Promise.all([
    fetchCampaignAgg(clientId, range.start, range.end),
    sql<{
      session_campaign: string;
      sessions: string | null;
      engaged: string | null;
      conversions: string | null;
      revenue: string | null;
    }>`
      select session_campaign, sum(sessions) as sessions, sum(engaged_sessions) as engaged,
        sum(ga4_conversions) as conversions, sum(ga4_revenue) as revenue
      from fact_ga4_campaign
      where client_id = ${clientId}::uuid and date between ${range.start}::date and ${range.end}::date
      group by session_campaign
    `.execute(getDb()),
  ]);
  const ga4 = new Map(ga4Rows.rows.map((r) => [r.session_campaign, r]));
  const rows: CampaignTraffic[] = campaigns.map((c) => {
    const channelGroup = c.platform === "meta" ? "Paid Social" : "Paid Search";
    const ga4Row = c.utmCampaign ? ga4.get(c.utmCampaign) : undefined;
    if (!ga4Row) {
      return {
        campaign: c.name,
        platform: c.platform,
        channelGroup,
        sessions: null,
        engagedSessions: null,
        engagementRate: null,
        transactions: 0,
        revenue: 0,
        aov: 0,
        utmMatched: false,
      };
    }
    const sessions = num(ga4Row.sessions);
    const transactions = Math.round(num(ga4Row.conversions));
    const revenue = r2(num(ga4Row.revenue));
    return {
      campaign: c.name,
      platform: c.platform,
      channelGroup,
      sessions: Math.round(sessions),
      engagedSessions: Math.round(num(ga4Row.engaged)),
      engagementRate: sessions > 0 ? r4(num(ga4Row.engaged) / sessions) : 0,
      transactions,
      revenue,
      aov: transactions > 0 ? r2(revenue / transactions) : 0,
      utmMatched: true,
    };
  });

  const notSet = ga4.get("(not set)");
  if (notSet) {
    const sessions = num(notSet.sessions);
    const transactions = Math.round(num(notSet.conversions));
    const revenue = r2(num(notSet.revenue));
    rows.push({
      campaign: "(not set)",
      platform: null,
      channelGroup: "Organic, direct, email, referral",
      sessions: Math.round(sessions),
      engagedSessions: Math.round(num(notSet.engaged)),
      engagementRate: sessions > 0 ? r4(num(notSet.engaged) / sessions) : 0,
      transactions,
      revenue,
      aov: transactions > 0 ? r2(revenue / transactions) : 0,
      utmMatched: true,
    });
  }

  return rows.sort((a, b) => (b.sessions ?? 0) - (a.sessions ?? 0));
}

export interface ContentTraffic {
  content: string;
  campaign: string;
  sessions: number;
  engagedSessions: number;
  engagementRate: number;
  transactions: number;
  revenue: number;
  aov: number;
}

export async function getContentTraffic(clientId: string, range: ResolvedRange): Promise<ContentTraffic[]> {
  const { rows } = await sql<{
    session_campaign: string;
    session_ad_content: string;
    sessions: string | null;
    engaged: string | null;
    conversions: string | null;
    revenue: string | null;
  }>`
    select session_campaign, session_ad_content, sum(sessions) as sessions, sum(engaged_sessions) as engaged,
      sum(ga4_conversions) as conversions, sum(ga4_revenue) as revenue
    from fact_ga4_content
    where client_id = ${clientId}::uuid and date between ${range.start}::date and ${range.end}::date
    group by session_campaign, session_ad_content
  `.execute(getDb());
  return rows
    .map((r) => {
      const sessions = num(r.sessions);
      const transactions = Math.round(num(r.conversions));
      const revenue = r2(num(r.revenue));
      return {
        content: r.session_ad_content,
        campaign: r.session_campaign,
        sessions: Math.round(sessions),
        engagedSessions: Math.round(num(r.engaged)),
        engagementRate: sessions > 0 ? r4(num(r.engaged) / sessions) : 0,
        transactions,
        revenue,
        aov: transactions > 0 ? r2(revenue / transactions) : 0,
      };
    })
    .sort((a, b) => b.sessions - a.sessions);
}

export interface TrafficEcommerceSummary {
  sessions: number;
  transactions: number;
  revenue: number;
  ecommerceConversionRate: number;
  aov: number;
}

export async function getTrafficEcommerceSummary(clientId: string, range: ResolvedRange): Promise<TrafficEcommerceSummary> {
  const { rows } = await sql<{ sessions: string | null; conversions: string | null; revenue: string | null }>`
    select sum(sessions) as sessions, sum(ga4_conversions) as conversions, sum(ga4_revenue) as revenue
    from fact_ga4_campaign
    where client_id = ${clientId}::uuid and date between ${range.start}::date and ${range.end}::date
  `.execute(getDb());
  const r = rows[0];
  const sessions = Math.round(num(r?.sessions));
  const transactions = Math.round(num(r?.conversions));
  const revenue = r2(num(r?.revenue));
  return {
    sessions,
    transactions,
    revenue,
    ecommerceConversionRate: sessions > 0 ? r4(transactions / sessions) : 0,
    aov: transactions > 0 ? r2(revenue / transactions) : 0,
  };
}

// ---------------------------------------------------------------------------
// Anomalies (mart_anomalies), ranked by absolute impact, not percentage.
// Generated offline (Claude narrative, post mart-rebuild); read directly.
// ---------------------------------------------------------------------------
export interface Anomaly {
  date: string;
  kind: "spend_swing" | "mer_move" | "conv_rate_drop";
  scope: string;
  impactAbs: number;
  narrative: string;
}

export async function getAnomalies(clientId: string, range: ResolvedRange): Promise<Anomaly[]> {
  const { rows } = await sql<{
    date: string;
    kind: Anomaly["kind"];
    scope: unknown;
    impact_abs: string;
    narrative: string | null;
  }>`
    select date::text as date, kind, scope, impact_abs, narrative
    from mart_anomalies
    where client_id = ${clientId}::uuid and date between ${range.start}::date and ${range.end}::date
    order by impact_abs desc
  `.execute(getDb());
  return rows.map((r) => ({
    date: r.date,
    kind: r.kind,
    scope: typeof r.scope === "string" ? r.scope : JSON.stringify(r.scope),
    impactAbs: Math.round(num(r.impact_abs)),
    narrative: r.narrative ?? "",
  }));
}
