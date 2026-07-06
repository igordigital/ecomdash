/**
 * Demo data layer. Shapes mirror the marts the dashboard will read.
 * When the pipeline lands, replace this module with real queries;
 * page components should not change.
 *
 * Every "get*" function takes a clientId (see lib/viewed-client.ts for how
 * pages resolve which client is being viewed) plus a ResolvedRange, and
 * returns the current period plus, where relevant, the prior period of
 * equal length for comparison. Each client gets its own deterministic
 * dataset: a wide per-client scale factor (clientJitter) makes different
 * clients look like genuinely different-sized, differently-performing
 * businesses, not just noise on the same numbers, while a narrower
 * per-range jitter (jitter) makes entity tables (campaigns, ads, products)
 * vary sensibly across date ranges without looking mechanically scaled.
 *
 * Generated deterministically (seeded RNG) with planted stories that apply
 * to every client's daily series, scaled by that client's own numbers:
 * - a checkout outage 10-12 days ago (revenue dip, MER drop, flagged)
 * - a Meta budget scale-up over the last 5 days (spend up, CTR softening,
 *   frequency climbing, MER holding)
 * Cross-source numbers are kept coherent: paid clicks reconcile with paid
 * sessions, session CVR reconciles orders with traffic, and the MER
 * numerator only ever comes from store revenue (Invariant 1).
 *
 * Entity tables (campaigns, ads, products) share the same template names
 * across clients (so every client has an "Advantage+ Shopping" campaign,
 * for example) with per-client numbers; the real pipeline will instead
 * filter mart rows by client_id and date, so no page logic changes.
 */

import { addDays, previousRange, type ResolvedRange } from "./range";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/** Deterministic 0.9-1.1 multiplier: per-row numbers vary by range without being random on every render. */
function jitter(seed: string): number {
  return 0.9 + mulberry32(hashSeed(seed))() * 0.2;
}

/** Deterministic 0.5-1.8 multiplier: makes different clients read as differently sized businesses, not just noise. */
function clientJitter(clientId: string, salt: string): number {
  return 0.5 + mulberry32(hashSeed(`${clientId}:${salt}`))() * 1.3;
}

function sliceByDate<T extends { date: string }>(arr: T[], start: string, end: string): T[] {
  return arr.filter((d) => d.date >= start && d.date <= end);
}

function sparkBounds(end: string, days = 14): { start: string; end: string } {
  return { start: addDays(end, -(days - 1)), end };
}

const BUILD_DAYS = 120;

function buildDates(): string[] {
  const out: string[] = [];
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1); // data lands daily; latest complete day is yesterday
  for (let i = BUILD_DAYS - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const DATES = buildDates();

/** Calendar bounds are shared across all clients (same "today" for everyone). */
export function getLatestDate(): string {
  return DATES[DATES.length - 1]!;
}

export function getEarliestDate(): string {
  return DATES[0]!;
}

// ---------------------------------------------------------------------------
// Blended daily facts (spend + store revenue): the MER inputs
// ---------------------------------------------------------------------------
export interface DailyFact {
  date: string;
  metaSpend: number;
  googleSpend: number;
  revenue: number; // store net revenue, the only revenue source (Invariant 1)
  orders: number;
}

function buildDaily(clientId: string): DailyFact[] {
  const scale = clientJitter(clientId, "spend-scale");
  const merQuality = 2.2 + clientJitter(clientId, "mer-quality") * 2.2; // ~2.2-4.9, this client's blended efficiency
  const rng = mulberry32(hashSeed(`${clientId}:daily`));
  return DATES.map((date, i) => {
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const growth = 1 + i * 0.0018;
    let metaSpend = 820 * scale * growth * (weekend ? 0.92 : 1) * (0.9 + rng() * 0.2);
    const googleSpend = 430 * scale * growth * (weekend ? 0.8 : 1) * (0.9 + rng() * 0.2);
    let revenue = (metaSpend + googleSpend) * merQuality * (weekend ? 1.1 : 1) * (0.85 + rng() * 0.3);
    if (i >= BUILD_DAYS - 5) metaSpend *= 1.55; // Advantage+ scale-up
    if (i >= BUILD_DAYS - 12 && i <= BUILD_DAYS - 10) revenue *= 0.55; // checkout outage
    const orders = Math.round(revenue / (95 + rng() * 30));
    return { date, metaSpend: r2(metaSpend), googleSpend: r2(googleSpend), revenue: r2(revenue), orders };
  });
}

const dailyCache = new Map<string, DailyFact[]>();
function getDaily(clientId: string): DailyFact[] {
  let d = dailyCache.get(clientId);
  if (!d) {
    d = buildDaily(clientId);
    dailyCache.set(clientId, d);
  }
  return d;
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
export function getMerSeries(clientId: string, range: ResolvedRange): MerPoint[] {
  const daily = getDaily(clientId);
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

export function getOverviewKpis(clientId: string, range: ResolvedRange): OverviewKpis {
  const daily = getDaily(clientId);
  const cur = aggBlended(sliceByDate(daily, range.start, range.end));
  const pr = previousRange(range);
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
// Rolling KPIs: fixed 1D / 7D / 30D snapshot, always anchored to yesterday,
// independent of the page's range selector. This is the always-visible
// "how are we doing right now at every horizon" strip on the Overview page.
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

export function getRollingWindows(clientId: string): RollingWindows {
  const daily = getDaily(clientId);
  const end = getLatestDate();
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
  atc: number; // add to cart
  ic: number; // initiated checkout
  purchases: number; // DIAGNOSTIC (platform attributed)
  convValue: number; // DIAGNOSTIC
}

function buildPlatformDaily(clientId: string, platform: "meta" | "google"): PlatformDay[] {
  const daily = getDaily(clientId);
  const rng = mulberry32(hashSeed(`${clientId}:${platform}`));
  return daily.map((d, i) => {
    const spend = platform === "meta" ? d.metaSpend : d.googleSpend;
    let impressions: number;
    let clicks: number;
    if (platform === "meta") {
      const cpm = 19 + rng() * 4;
      impressions = Math.round((spend / cpm) * 1000);
      let ctr = 0.0145 + rng() * 0.003;
      if (i >= BUILD_DAYS - 5) ctr *= 0.88; // scale-up softens CTR
      clicks = Math.round(impressions * ctr);
    } else {
      const cpc = 1.1 + rng() * 0.25;
      clicks = Math.round(spend / cpc);
      const ctr = 0.032 + rng() * 0.006;
      impressions = Math.round(clicks / ctr);
    }
    const freqBase = platform === "meta" ? 2.1 + rng() * 0.5 : 1.4 + rng() * 0.2;
    const frequency = platform === "meta" && i >= BUILD_DAYS - 5 ? freqBase + 0.7 : freqBase;
    const reach = Math.round(impressions / frequency);
    const atc = Math.round(clicks * (platform === "meta" ? 0.115 + rng() * 0.025 : 0.135 + rng() * 0.025));
    const ic = Math.round(atc * (0.6 + rng() * 0.08));
    let purchases = Math.round(ic * (platform === "meta" ? 0.56 + rng() * 0.08 : 0.5 + rng() * 0.08));
    if (i >= BUILD_DAYS - 12 && i <= BUILD_DAYS - 10) purchases = Math.round(purchases * 0.6); // outage hits platform conversions too
    const convValue = r2(purchases * (platform === "meta" ? 108 + rng() * 18 : 88 + rng() * 16));
    return { date: d.date, spend, impressions, clicks, reach, frequency: r2(frequency), atc, ic, purchases, convValue };
  });
}

const platformDailyCache = new Map<string, PlatformDay[]>();
function getPlatformDaily(clientId: string, platform: "meta" | "google"): PlatformDay[] {
  const key = `${clientId}:${platform}`;
  let d = platformDailyCache.get(key);
  if (!d) {
    d = buildPlatformDaily(clientId, platform);
    platformDailyCache.set(key, d);
  }
  return d;
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
  roas: number; // DIAGNOSTIC ONLY
  costPerAtc: number | null;
  clickCvr: number; // purchases / clicks, platform attributed
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

export function getNetworkKpis(clientId: string, platform: "meta" | "google", range: ResolvedRange): NetworkKpis {
  const daily = getPlatformDaily(clientId, platform);
  const cur = sliceByDate(daily, range.start, range.end);
  const pr = previousRange(range);
  const prev = sliceByDate(daily, pr.start, pr.end);
  const trendDays = cur;
  const sparkWin = sparkBounds(range.end);
  const spark = sliceByDate(daily, sparkWin.start, sparkWin.end);
  return {
    cur: aggNetwork(cur),
    prev: aggNetwork(prev),
    trend: trendDays.map((d) => ({
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
  newShare: number; // share of orders from new customers
}

function buildStoreDaily(clientId: string): StoreDay[] {
  const daily = getDaily(clientId);
  const rng = mulberry32(hashSeed(`${clientId}:store`));
  return daily.map((d) => {
    const refunds = r2(d.revenue * (0.025 + rng() * 0.03));
    return {
      date: d.date,
      revenue: d.revenue,
      orders: d.orders,
      aov: d.orders > 0 ? r2(d.revenue / d.orders) : 0,
      refunds,
      discountRate: r4(0.07 + rng() * 0.05),
      newShare: r4(0.56 + rng() * 0.14),
    };
  });
}

const storeDailyCache = new Map<string, StoreDay[]>();
function getStoreDaily(clientId: string): StoreDay[] {
  let d = storeDailyCache.get(clientId);
  if (!d) {
    d = buildStoreDaily(clientId);
    storeDailyCache.set(clientId, d);
  }
  return d;
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

export function getStoreKpis(
  clientId: string,
  range: ResolvedRange,
): { cur: StoreStats; prev: StoreStats; daily: StoreDay[] } {
  const storeDaily = getStoreDaily(clientId);
  const daily = sliceByDate(storeDaily, range.start, range.end);
  const cur = aggStore(daily);
  const pr = previousRange(range);
  const prev = aggStore(sliceByDate(storeDaily, pr.start, pr.end));
  return { cur, prev, daily };
}

// ---------------------------------------------------------------------------
// Top products (store), with availability status. Baseline is a 28-day
// snapshot scaled to the selected range; the real pipeline sums per-product
// order lines within the date range directly.
// ---------------------------------------------------------------------------
export interface Product {
  name: string;
  sku: string;
  units: number;
  revenue: number;
  price: number;
  stock: "in_stock" | "low_stock" | "out_of_stock";
  deltaPct: number; // vs prior period of equal length
}

const BASE_PRODUCTS: Product[] = [
  { name: "Trailhead 45L Backpack", sku: "TH-BP-45", units: 342, revenue: 44409, price: 129.9, stock: "in_stock", deltaPct: 0.18 },
  { name: "Summit Insulated Jacket", sku: "SM-JK-01", units: 198, revenue: 31667, price: 159.9, stock: "low_stock", deltaPct: 0.09 },
  { name: "Basecamp 2P Tent", sku: "BC-TN-2P", units: 87, revenue: 26091, price: 299.9, stock: "in_stock", deltaPct: -0.04 },
  { name: "Ridge Hiking Boots", sku: "RG-BT-M", units: 156, revenue: 21824, price: 139.9, stock: "in_stock", deltaPct: 0.22 },
  { name: "Alpine Sleeping Bag 0C", sku: "AL-SB-0C", units: 112, revenue: 15668, price: 139.9, stock: "out_of_stock", deltaPct: -0.31 },
  { name: "Creek Water Filter", sku: "CR-WF-01", units: 289, revenue: 14421, price: 49.9, stock: "in_stock", deltaPct: 0.05 },
  { name: "Peak Trekking Poles (pair)", sku: "PK-TP-PR", units: 174, revenue: 12163, price: 69.9, stock: "in_stock", deltaPct: 0.11 },
  { name: "Ember Camp Stove", sku: "EM-CS-01", units: 98, revenue: 8791, price: 89.7, stock: "low_stock", deltaPct: -0.08 },
  { name: "Drift Dry Bag 20L", sku: "DR-DB-20", units: 201, revenue: 6023, price: 29.9, stock: "in_stock", deltaPct: 0.02 },
  { name: "Lumen Headlamp 400", sku: "LM-HL-04", units: 143, revenue: 5713, price: 39.9, stock: "in_stock", deltaPct: 0.14 },
];

export function getTopProducts(clientId: string, range: ResolvedRange): Product[] {
  const factor = range.days / 28;
  const scale = clientJitter(clientId, "products-scale");
  return BASE_PRODUCTS.map((p) => {
    const seed = `${clientId}:${p.sku}:${range.key}:${range.days}`;
    const j = jitter(seed);
    const units = Math.max(0, Math.round(p.units * factor * scale * j));
    const revenue = r2(units * p.price);
    const deltaJ = mulberry32(hashSeed(seed + ":delta"))();
    const deltaPct = r4(p.deltaPct * (0.7 + deltaJ * 0.6));
    return { ...p, units, revenue, deltaPct };
  }).sort((a, b) => b.revenue - a.revenue);
}

// ---------------------------------------------------------------------------
// Funnels
// ---------------------------------------------------------------------------
export interface FunnelStage {
  label: string;
  value: number;
  prev: number;
}

function siteFunnelStage(clientId: string, start: string, end: string) {
  const traffic = sliceByDate(getTrafficSeriesFull(clientId), start, end);
  const sessions = traffic.reduce((s, row) => s + CHANNELS.reduce((t, ch) => t + Number(row[ch] ?? 0), 0), 0);
  const orders = sliceByDate(getStoreDaily(clientId), start, end).reduce((s, d) => s + d.orders, 0);
  const rng = mulberry32(hashSeed(`${clientId}:funnel:${start}:${end}`));
  const atc = Math.round(sessions * (0.079 + rng() * 0.004));
  const checkout = Math.round(atc * (0.6 + rng() * 0.03));
  return { sessions, atc, checkout, orders };
}

/** Site funnel from GA4 + store: sessions -> add to cart -> checkout -> orders. */
export function getSiteFunnel(clientId: string, range: ResolvedRange): FunnelStage[] {
  const cur = siteFunnelStage(clientId, range.start, range.end);
  const pr = previousRange(range);
  const prev = siteFunnelStage(clientId, pr.start, pr.end);
  return [
    { label: "Sessions", value: cur.sessions, prev: prev.sessions },
    { label: "Add to cart", value: cur.atc, prev: prev.atc },
    { label: "Checkout started", value: cur.checkout, prev: prev.checkout },
    { label: "Orders", value: cur.orders, prev: prev.orders },
  ];
}

/** Network funnel from the platform's own reporting (diagnostic attribution). */
export function getNetworkFunnel(clientId: string, platform: "meta" | "google", range: ResolvedRange): FunnelStage[] {
  const daily = getPlatformDaily(clientId, platform);
  const cur = aggNetwork(sliceByDate(daily, range.start, range.end));
  const pr = previousRange(range);
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
  cvr: number; // session -> order
  abandonment: number; // 1 - orders / add-to-carts
}

export function getFunnelTrend(clientId: string, range: ResolvedRange): FunnelTrendPoint[] {
  const storeByDate = new Map(getStoreDaily(clientId).map((d) => [d.date, d]));
  return sliceByDate(getTrafficSeriesFull(clientId), range.start, range.end).map((row) => {
    const date = String(row.date);
    const sessions = CHANNELS.reduce((t, ch) => t + Number(row[ch] ?? 0), 0);
    const orders = storeByDate.get(date)?.orders ?? 0;
    const localRng = mulberry32(hashSeed(`${clientId}:${date}`));
    const atc = Math.round(sessions * (0.075 + localRng() * 0.012));
    return {
      date,
      cvr: sessions > 0 ? r4(orders / sessions) : 0,
      abandonment: atc > 0 ? r4(Math.max(0, 1 - orders / atc)) : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Campaign health (28d baseline, scaled to the selected range and client)
// ---------------------------------------------------------------------------
export type Health = "scaling" | "healthy" | "watch" | "fatigued" | "inefficient";

export interface CampaignHealth {
  platform: "meta" | "google";
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  /** DIAGNOSTIC ONLY: platform_conv_value / spend, per platform attribution. */
  platformRoas: number;
  ga4Sessions: number | null;
  ga4EngagementRate: number | null;
  utmMatched: boolean;
  health: Health;
}

const BASE_CAMPAIGNS: CampaignHealth[] = [
  { platform: "meta", name: "Advantage+ Shopping", spend: 12840, impressions: 622000, clicks: 9800, platformRoas: 3.8, ga4Sessions: 8100, ga4EngagementRate: 0.46, utmMatched: true, health: "scaling" },
  { platform: "meta", name: "Prospecting | Broad Interests", spend: 6420, impressions: 408000, clicks: 5900, platformRoas: 2.1, ga4Sessions: 4900, ga4EngagementRate: 0.38, utmMatched: true, health: "watch" },
  { platform: "google", name: "Performance Max | All Products", spend: 5460, impressions: 182000, clicks: 5200, platformRoas: 3.2, ga4Sessions: 4300, ga4EngagementRate: 0.44, utmMatched: true, health: "healthy" },
  { platform: "meta", name: "Retargeting | 30d Viewers", spend: 4180, impressions: 96000, clicks: 2900, platformRoas: 5.6, ga4Sessions: 2400, ga4EngagementRate: 0.52, utmMatched: true, health: "fatigued" },
  { platform: "google", name: "Non-Brand Search | Core Terms", spend: 3890, impressions: 74000, clicks: 2900, platformRoas: 1.8, ga4Sessions: 2400, ga4EngagementRate: 0.4, utmMatched: true, health: "watch" },
  { platform: "meta", name: "Lookalike 1% | Purchasers", spend: 3350, impressions: 151000, clicks: 2300, platformRoas: 2.9, ga4Sessions: null, ga4EngagementRate: null, utmMatched: false, health: "healthy" },
  { platform: "google", name: "Brand Search", spend: 2980, impressions: 32000, clicks: 2200, platformRoas: 8.4, ga4Sessions: 1900, ga4EngagementRate: 0.61, utmMatched: true, health: "healthy" },
  { platform: "meta", name: "Brand Awareness | Reach", spend: 1240, impressions: 168000, clicks: 800, platformRoas: 0.9, ga4Sessions: 650, ga4EngagementRate: 0.33, utmMatched: true, health: "inefficient" },
];

const BASELINE_DAYS = 28;

export function getCampaignHealth(clientId: string, range: ResolvedRange): CampaignHealth[] {
  const factor = range.days / BASELINE_DAYS;
  const scale = clientJitter(clientId, "campaigns-scale");
  const rows = BASE_CAMPAIGNS.map((c) => {
    const seed = `${clientId}:${c.platform}:${c.name}:${range.key}:${range.days}`;
    const j = jitter(seed);
    const roasJ = 0.7 + clientJitter(clientId, `${c.name}:roas`) * 0.6;
    return {
      ...c,
      spend: r2(c.spend * factor * scale * j),
      impressions: Math.round(c.impressions * factor * scale * j),
      clicks: Math.round(c.clicks * factor * scale * j),
      platformRoas: r2(c.platformRoas * roasJ),
      ga4Sessions: c.ga4Sessions !== null ? Math.round(c.ga4Sessions * factor * scale * j) : null,
    };
  });
  return rows.sort((a, b) => b.spend - a.spend);
}

export function getUtmMatchRate(clientId: string, range: ResolvedRange): number {
  const meta = getCampaignHealth(clientId, range).filter((c) => c.platform === "meta");
  const total = meta.reduce((s, c) => s + c.spend, 0);
  const matched = meta.filter((c) => c.utmMatched).reduce((s, c) => s + c.spend, 0);
  return total > 0 ? matched / total : 0;
}

// ---------------------------------------------------------------------------
// Meta ad-level drill-down + creative breakdown
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

const BASE_META_ADS: MetaAd[] = [
  { campaign: "Advantage+ Shopping", adset: "Advantage+ | Auto", name: "UGC Video | Sarah unboxing v2", type: "UGC video", status: "ACTIVE", spend: 4620, impressions: 224000, clicks: 3800, purchases: 168, convValue: 19100, frequency: 2.4 },
  { campaign: "Advantage+ Shopping", adset: "Advantage+ | Auto", name: "Static | Summer bundle 20% off", type: "Static", status: "ACTIVE", spend: 3980, impressions: 192000, clicks: 2800, purchases: 121, convValue: 13600, frequency: 2.1 },
  { campaign: "Advantage+ Shopping", adset: "Advantage+ | Auto", name: "Carousel | Top sellers Q2", type: "Carousel", status: "ACTIVE", spend: 2710, impressions: 130000, clicks: 1900, purchases: 74, convValue: 8400, frequency: 1.9 },
  { campaign: "Advantage+ Shopping", adset: "Advantage+ | Auto", name: "UGC Video | Mike review 15s", type: "UGC video", status: "PAUSED", spend: 1530, impressions: 72000, clicks: 1050, purchases: 29, convValue: 3200, frequency: 3.1 },
  { campaign: "Prospecting | Broad Interests", adset: "Broad | US 25-54", name: "Video | Founder story 30s", type: "Brand video", status: "ACTIVE", spend: 2840, impressions: 199000, clicks: 2600, purchases: 52, convValue: 5900, frequency: 1.6 },
  { campaign: "Prospecting | Broad Interests", adset: "Broad | US 25-54", name: "Static | Problem-solution v3", type: "Static", status: "ACTIVE", spend: 2260, impressions: 158000, clicks: 2100, purchases: 41, convValue: 4700, frequency: 1.7 },
  { campaign: "Prospecting | Broad Interests", adset: "Interests | Outdoor", name: "Carousel | Use cases", type: "Carousel", status: "PAUSED", spend: 1320, impressions: 93000, clicks: 1100, purchases: 18, convValue: 2000, frequency: 2.2 },
  { campaign: "Retargeting | 30d Viewers", adset: "Viewers 30d | Exclude buyers", name: "DPA | Viewed products", type: "DPA", status: "ACTIVE", spend: 2380, impressions: 55000, clicks: 1700, purchases: 118, convValue: 13300, frequency: 6.8 },
  { campaign: "Retargeting | 30d Viewers", adset: "Viewers 30d | Exclude buyers", name: "Static | Free shipping reminder", type: "Static", status: "ACTIVE", spend: 1800, impressions: 41000, clicks: 1250, purchases: 79, convValue: 8900, frequency: 8.2 },
  { campaign: "Lookalike 1% | Purchasers", adset: "LAL 1% | US", name: "UGC Video | Sarah unboxing v2", type: "UGC video", status: "ACTIVE", spend: 1980, impressions: 98000, clicks: 1550, purchases: 47, convValue: 5300, frequency: 1.8 },
  { campaign: "Lookalike 1% | Purchasers", adset: "LAL 1% | US", name: "Static | Press logos", type: "Static", status: "ACTIVE", spend: 1370, impressions: 66000, clicks: 1100, purchases: 30, convValue: 3400, frequency: 1.9 },
  { campaign: "Brand Awareness | Reach", adset: "Reach | US broad", name: "Video | Brand anthem 15s", type: "Brand video", status: "ACTIVE", spend: 1240, impressions: 168000, clicks: 800, purchases: 10, convValue: 1100, frequency: 1.3 },
];

/** Frequency grows slower than linear with window length (reach saturates); sqrt approximates that. */
function scaledFrequency(base: number, factor: number, seed: string): number {
  const j = 0.95 + mulberry32(hashSeed(seed))() * 0.1;
  return r2(Math.max(1, base * Math.sqrt(factor) * j));
}

export function getMetaAds(clientId: string, range: ResolvedRange): MetaAd[] {
  const factor = range.days / BASELINE_DAYS;
  const scale = clientJitter(clientId, "campaigns-scale"); // same salt as getCampaignHealth so ad-level and campaign-level totals stay proportionate
  const rows = BASE_META_ADS.map((ad) => {
    const seed = `${clientId}:${ad.campaign}:${ad.name}:${range.key}:${range.days}`;
    const j = jitter(seed);
    return {
      ...ad,
      spend: r2(ad.spend * factor * scale * j),
      impressions: Math.round(ad.impressions * factor * scale * j),
      clicks: Math.round(ad.clicks * factor * scale * j),
      purchases: Math.round(ad.purchases * factor * scale * j),
      convValue: r2(ad.convValue * factor * scale * j),
      frequency: scaledFrequency(ad.frequency, factor, seed + ":freq"),
    };
  });
  return rows.sort((a, b) => b.spend - a.spend);
}

export interface CreativeSlice {
  type: CreativeType;
  spend: number;
  share: number;
  purchases: number;
  roas: number; // DIAGNOSTIC
  ctr: number;
}

export function getCreativeBreakdown(clientId: string, range: ResolvedRange): CreativeSlice[] {
  const ads = getMetaAds(clientId, range);
  const total = ads.reduce((s, a) => s + a.spend, 0);
  const byType = new Map<
    CreativeType,
    { spend: number; purchases: number; convValue: number; clicks: number; impressions: number }
  >();
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
  conversions: number; // DIAGNOSTIC
  convValue: number; // DIAGNOSTIC
  impressionShare: number | null; // PMax does not report search IS meaningfully
  health: Health;
}

const BASE_GOOGLE_CAMPAIGNS: GoogleCampaign[] = [
  { name: "Performance Max | All Products", type: "Performance Max", spend: 5460, impressions: 182000, clicks: 5200, conversions: 214, convValue: 17470, impressionShare: null, health: "healthy" },
  { name: "Non-Brand Search | Core Terms", type: "Search", spend: 3890, impressions: 74000, clicks: 2900, conversions: 78, convValue: 7000, impressionShare: 0.42, health: "watch" },
  { name: "Brand Search", type: "Search", spend: 2980, impressions: 32000, clicks: 2200, conversions: 189, convValue: 25030, impressionShare: 0.87, health: "healthy" },
];

export function getGoogleCampaigns(clientId: string, range: ResolvedRange): GoogleCampaign[] {
  const factor = range.days / BASELINE_DAYS;
  const scale = clientJitter(clientId, "campaigns-scale");
  const rows = BASE_GOOGLE_CAMPAIGNS.map((c) => {
    const seed = `${clientId}:${c.name}:${range.key}:${range.days}`;
    const j = jitter(seed);
    const isJ = c.impressionShare !== null ? 0.95 + mulberry32(hashSeed(seed + ":is"))() * 0.1 : 1;
    return {
      ...c,
      spend: r2(c.spend * factor * scale * j),
      impressions: Math.round(c.impressions * factor * scale * j),
      clicks: Math.round(c.clicks * factor * scale * j),
      conversions: Math.round(c.conversions * factor * scale * j),
      convValue: r2(c.convValue * factor * scale * j),
      impressionShare: c.impressionShare !== null ? r4(Math.min(1, c.impressionShare * isJ)) : null,
    };
  });
  return rows.sort((a, b) => b.spend - a.spend);
}

// ---------------------------------------------------------------------------
// Site traffic health (fact_ga4_traffic; no crosswalk needed)
// ---------------------------------------------------------------------------
export const CHANNELS = [
  "Organic Search",
  "Paid Social",
  "Paid Search",
  "Direct",
  "Email",
  "Referral",
] as const;

export interface TrafficDay {
  date: string;
  [channel: string]: number | string;
}

const trafficCache = new Map<string, TrafficDay[]>();

function getTrafficSeriesFull(clientId: string): TrafficDay[] {
  const cached = trafficCache.get(clientId);
  if (cached) return cached;
  const scale = clientJitter(clientId, "traffic-scale");
  const rng = mulberry32(hashSeed(`${clientId}:traffic`));
  const base: Record<string, number> = {
    "Organic Search": 620,
    "Paid Social": 540,
    "Paid Search": 310,
    "Direct": 280,
    "Email": 150,
    "Referral": 90,
  };
  const series = DATES.map((date, i) => {
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const growth = 1 + i * 0.0015;
    const row: TrafficDay = { date };
    for (const ch of CHANNELS) {
      let v = (base[ch] ?? 100) * scale * growth * (0.85 + rng() * 0.3);
      if (weekend) v *= ch === "Paid Search" ? 0.75 : ch === "Email" ? 0.7 : 0.95;
      if (ch === "Paid Social" && i >= BUILD_DAYS - 5) v *= 1.5;
      if (ch === "Email" && i % 7 === 3) v *= 2.6;
      row[ch] = Math.round(v);
    }
    return row;
  });
  trafficCache.set(clientId, series);
  return series;
}

export function getTrafficSeries(clientId: string, range: ResolvedRange): TrafficDay[] {
  return sliceByDate(getTrafficSeriesFull(clientId), range.start, range.end);
}

export interface ChannelSummary {
  channel: string;
  sessions: number;
  engagementRate: number;
  avgSessionDuration: number;
  bounceRate: number;
  newUserShare: number;
}

export function getChannelSummaries(clientId: string, range: ResolvedRange): ChannelSummary[] {
  const series = sliceByDate(getTrafficSeriesFull(clientId), range.start, range.end);
  const totals: Record<string, number> = {};
  for (const row of series) {
    for (const ch of CHANNELS) {
      totals[ch] = (totals[ch] ?? 0) + Number(row[ch] ?? 0);
    }
  }
  const quality: Record<string, [number, number, number, number]> = {
    "Organic Search": [0.58, 142, 0.42, 0.64],
    "Paid Social": [0.41, 78, 0.59, 0.83],
    "Paid Search": [0.55, 121, 0.45, 0.71],
    "Direct": [0.62, 168, 0.38, 0.35],
    "Email": [0.68, 195, 0.32, 0.12],
    "Referral": [0.53, 130, 0.47, 0.57],
  };
  return CHANNELS.map((ch) => {
    const q = quality[ch] ?? [0.5, 120, 0.5, 0.5];
    return {
      channel: ch,
      sessions: totals[ch] ?? 0,
      engagementRate: q[0],
      avgSessionDuration: q[1],
      bounceRate: q[2],
      newUserShare: q[3],
    };
  }).sort((a, b) => b.sessions - a.sessions);
}

/**
 * Session -> transaction -> revenue for a GA4 ecommerce breakdown row.
 * These are GA4's own attributed transactions and revenue: DIAGNOSTIC ONLY,
 * never a substitute for store net revenue (Invariant 1). Conversion rate
 * and AOV ranges are seeded per row so they read as plausible, distinct
 * numbers rather than a mechanical scale of sessions.
 */
function ecommerceFromSessions(
  sessions: number,
  seed: string,
  cvrRange: [number, number],
  aovRange: [number, number],
): { transactions: number; revenue: number; aov: number } {
  const cvr = cvrRange[0] + mulberry32(hashSeed(seed + ":cvr"))() * (cvrRange[1] - cvrRange[0]);
  const aov = aovRange[0] + mulberry32(hashSeed(seed + ":aov"))() * (aovRange[1] - aovRange[0]);
  const transactions = Math.round(sessions * cvr);
  const revenue = r2(transactions * aov);
  return { transactions, revenue, aov: transactions > 0 ? r2(revenue / transactions) : 0 };
}

// ---------------------------------------------------------------------------
// Campaign and content (ad) level traffic, with GA4 ecommerce metrics.
// Google Ads links to GA4 natively via GCLID, so its rows carry sessions
// and ecommerce data reliably; Meta's link is UTM-dependent (utm_campaign,
// utm_content), so a campaign with poor tagging shows "no UTM match" here
// exactly as it does on the Campaigns page, and only Meta contributes
// content-level (ad/creative) rows in this account.
// ---------------------------------------------------------------------------
export interface CampaignTraffic {
  campaign: string;
  platform: "meta" | "google" | null; // null = non-paid / untagged bucket
  channelGroup: string;
  sessions: number | null; // null = no UTM match
  engagedSessions: number | null;
  engagementRate: number | null;
  transactions: number; // GA4, DIAGNOSTIC ONLY
  revenue: number; // GA4, DIAGNOSTIC ONLY
  aov: number;
  utmMatched: boolean;
}

export function getCampaignTraffic(clientId: string, range: ResolvedRange): CampaignTraffic[] {
  const rows: CampaignTraffic[] = getCampaignHealth(clientId, range).map((c) => {
    const seed = `${clientId}:${c.platform}:${c.name}:campaign-traffic:${range.key}:${range.days}`;
    const channelGroup = c.platform === "meta" ? "Paid Social" : "Paid Search";
    if (c.ga4Sessions === null || c.ga4EngagementRate === null) {
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
    const cvrRange: [number, number] = c.platform === "meta" ? [0.01, 0.022] : [0.025, 0.045];
    const eco = ecommerceFromSessions(c.ga4Sessions, seed, cvrRange, [95, 145]);
    return {
      campaign: c.name,
      platform: c.platform,
      channelGroup,
      sessions: c.ga4Sessions,
      engagedSessions: Math.round(c.ga4Sessions * c.ga4EngagementRate),
      engagementRate: c.ga4EngagementRate,
      transactions: eco.transactions,
      revenue: eco.revenue,
      aov: eco.aov,
      utmMatched: true,
    };
  });

  // Everything without a paid-campaign UTM: organic, direct, email, referral.
  const notSetSessions = getChannelSummaries(clientId, range)
    .filter((ch) => ch.channel !== "Paid Social" && ch.channel !== "Paid Search")
    .reduce((s, ch) => s + ch.sessions, 0);
  const notSetSeed = `${clientId}:not-set:campaign-traffic:${range.key}:${range.days}`;
  const notSetEco = ecommerceFromSessions(notSetSessions, notSetSeed, [0.012, 0.028], [85, 130]);
  rows.push({
    campaign: "(not set)",
    platform: null,
    channelGroup: "Organic, direct, email, referral",
    sessions: notSetSessions,
    engagedSessions: Math.round(notSetSessions * 0.52),
    engagementRate: 0.52,
    transactions: notSetEco.transactions,
    revenue: notSetEco.revenue,
    aov: notSetEco.aov,
    utmMatched: true,
  });

  return rows.sort((a, b) => (b.sessions ?? 0) - (a.sessions ?? 0));
}

export interface ContentTraffic {
  content: string;
  campaign: string;
  sessions: number;
  engagedSessions: number;
  engagementRate: number;
  transactions: number; // GA4, DIAGNOSTIC ONLY
  revenue: number; // GA4, DIAGNOSTIC ONLY
  aov: number;
}

/**
 * utm_content breakdown. Meta only: Google's GA4 link is native via GCLID
 * and does not rely on manual content tagging. Ads under a campaign whose
 * own utm_campaign doesn't match GA4 are excluded: content tags are a
 * sub-dimension of the campaign tag, so if the campaign-level join fails,
 * the content-level join can't succeed either (same UTM match rate shown
 * on the Campaigns page and above).
 */
export function getContentTraffic(clientId: string, range: ResolvedRange): ContentTraffic[] {
  const matchedCampaigns = new Set(
    getCampaignHealth(clientId, range)
      .filter((c) => c.utmMatched)
      .map((c) => c.name),
  );
  return getMetaAds(clientId, range)
    .filter((ad) => matchedCampaigns.has(ad.campaign))
    .map((ad) => {
      const seed = `${clientId}:${ad.campaign}:${ad.name}:content-traffic:${range.key}:${range.days}`;
      const dropoff = 0.75 + mulberry32(hashSeed(seed + ":sess"))() * 0.2;
      const sessions = Math.max(1, Math.round(ad.clicks * dropoff));
      const engagementRate = r4(0.35 + mulberry32(hashSeed(seed + ":eng"))() * 0.25);
      const eco = ecommerceFromSessions(sessions, seed, [0.012, 0.026], [95, 145]);
      return {
        content: ad.name,
        campaign: ad.campaign,
        sessions,
        engagedSessions: Math.round(sessions * engagementRate),
        engagementRate,
        transactions: eco.transactions,
        revenue: eco.revenue,
        aov: eco.aov,
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

/** Site-wide GA4 ecommerce rollup (paid campaigns + the not-set bucket = all traffic). DIAGNOSTIC ONLY. */
export function getTrafficEcommerceSummary(clientId: string, range: ResolvedRange): TrafficEcommerceSummary {
  const rows = getCampaignTraffic(clientId, range);
  const sessions = rows.reduce((s, r) => s + (r.sessions ?? 0), 0);
  const transactions = rows.reduce((s, r) => s + r.transactions, 0);
  const revenue = r2(rows.reduce((s, r) => s + r.revenue, 0));
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
// ---------------------------------------------------------------------------
export interface Anomaly {
  date: string;
  kind: "spend_swing" | "mer_move" | "conv_rate_drop";
  scope: string;
  impactAbs: number;
  narrative: string;
}

const at = (back: number) => DATES[DATES.length - 1 - back] ?? "";

const ANOMALY_TEMPLATES: Omit<Anomaly, "impactAbs">[] = [
  {
    date: at(11),
    kind: "mer_move",
    scope: "Blended",
    narrative:
      "7 day MER fell from 3.4 to 2.4 across three days while spend held steady. Store net revenue dropped against trend. The dip lines up with the checkout errors the store logged in the same window, not with ad performance. Revenue recovered once checkout was fixed.",
  },
  {
    date: at(1),
    kind: "spend_swing",
    scope: "Meta | Advantage+ Shopping",
    narrative:
      "Advantage+ Shopping spend is up for five straight days following the budget increase on the campaign. Blended 7 day MER has held through the scale-up, so the added spend is converting so far. Watch frequency on the top two ads.",
  },
  {
    date: at(2),
    kind: "conv_rate_drop",
    scope: "Meta | Retargeting | 30d Viewers",
    narrative:
      "Conversion rate on the free shipping reminder ad fell over the last week while frequency climbed past 8. Creative fatigue is the likely cause. A fresh variant or a frequency cap would protect the retargeting pool.",
  },
  {
    date: at(4),
    kind: "spend_swing",
    scope: "Google | Performance Max",
    narrative:
      "Performance Max spend dipped against its 7 day average over the weekend, then recovered. Google reports no budget or status changes. This pattern matches normal weekend auction softness for this account and needs no action.",
  },
  {
    date: at(6),
    kind: "conv_rate_drop",
    scope: "Google | Non-Brand Search | Core Terms",
    narrative:
      "Click-through rate on Non-Brand Search fell after the ad rotation on the core terms ad group. The two new responsive ads have weaker headlines than the ones they replaced. Worth reverting or testing new copy.",
  },
];

const BASE_IMPACT: Record<string, number> = {
  Blended: 8400,
  "Meta | Advantage+ Shopping": 3100,
  "Meta | Retargeting | 30d Viewers": 1900,
  "Google | Performance Max": 740,
  "Google | Non-Brand Search | Core Terms": 520,
};

export function getAnomalies(clientId: string, range: ResolvedRange): Anomaly[] {
  const scale = clientJitter(clientId, "campaigns-scale");
  return ANOMALY_TEMPLATES.filter((a) => a.date >= range.start && a.date <= range.end)
    .map((a) => ({ ...a, impactAbs: Math.round((BASE_IMPACT[a.scope] ?? 500) * scale) }))
    .sort((a, b) => b.impactAbs - a.impactAbs);
}

export const DEMO_CLIENT = { name: "Acme Outdoors", slug: "acme-outdoors" };
