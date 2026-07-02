/**
 * Demo data layer. Shapes mirror the marts the dashboard will read.
 * When the pipeline lands, replace this module with real queries;
 * page components should not change.
 *
 * Generated deterministically (seeded RNG) with planted stories:
 * - a checkout outage 10-12 days ago (revenue dip, MER drop, flagged)
 * - a Meta budget scale-up over the last 5 days (spend up, CTR softening,
 *   frequency climbing, MER holding)
 * Cross-source numbers are kept coherent: paid clicks reconcile with paid
 * sessions, session CVR reconciles orders with traffic, and the MER
 * numerator only ever comes from store revenue (Invariant 1).
 */

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

const BUILD_DAYS = 120;
const SHOW_DAYS = 90;

function buildDates(): string[] {
  const out: string[] = [];
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  for (let i = BUILD_DAYS - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function windowSlice<T>(arr: T[], days: number, offset = 0): T[] {
  const end = arr.length - offset;
  return arr.slice(Math.max(0, end - days), end);
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

function buildDaily(): DailyFact[] {
  const rng = mulberry32(42);
  return buildDates().map((date, i) => {
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const growth = 1 + i * 0.0018;
    let metaSpend = 820 * growth * (weekend ? 0.92 : 1) * (0.9 + rng() * 0.2);
    const googleSpend = 430 * growth * (weekend ? 0.8 : 1) * (0.9 + rng() * 0.2);
    let revenue = (metaSpend + googleSpend) * 3.25 * (weekend ? 1.1 : 1) * (0.85 + rng() * 0.3);
    if (i >= BUILD_DAYS - 5) metaSpend *= 1.55; // Advantage+ scale-up
    if (i >= BUILD_DAYS - 12 && i <= BUILD_DAYS - 10) revenue *= 0.55; // checkout outage
    const orders = Math.round(revenue / (95 + rng() * 30));
    return { date, metaSpend: r2(metaSpend), googleSpend: r2(googleSpend), revenue: r2(revenue), orders };
  });
}

const DAILY = buildDaily();

export interface MerPoint {
  date: string;
  metaSpend: number;
  googleSpend: number;
  revenue: number;
  mer7: number | null;
  mer28: number | null;
}

function rollingSum(i: number, w: number): { spend: number; revenue: number } | null {
  if (i + 1 < w) return null;
  let spend = 0;
  let revenue = 0;
  for (let j = i - w + 1; j <= i; j++) {
    const d = DAILY[j];
    if (!d) return null;
    spend += d.metaSpend + d.googleSpend;
    revenue += d.revenue;
  }
  return { spend, revenue };
}

export function getMerSeries(): MerPoint[] {
  return DAILY.map((d, i) => {
    const w7 = rollingSum(i, 7);
    const w28 = rollingSum(i, 28);
    return {
      date: d.date,
      metaSpend: d.metaSpend,
      googleSpend: d.googleSpend,
      revenue: d.revenue,
      mer7: w7 && w7.spend > 0 ? r2(w7.revenue / w7.spend) : null,
      mer28: w28 && w28.spend > 0 ? r2(w28.revenue / w28.spend) : null,
    };
  }).slice(-SHOW_DAYS);
}

export const MER_TARGET = 3.0;

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

function buildPlatformDaily(platform: "meta" | "google"): PlatformDay[] {
  const rng = mulberry32(platform === "meta" ? 101 : 202);
  return DAILY.map((d, i) => {
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
    return {
      date: d.date,
      spend,
      impressions,
      clicks,
      reach,
      frequency: r2(frequency),
      atc,
      ic,
      purchases,
      convValue,
    };
  });
}

const META_DAILY = buildPlatformDaily("meta");
const GOOGLE_DAILY = buildPlatformDaily("google");

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
  cur: NetworkStats; // last 28 days
  prev: NetworkStats; // prior 28 days
  trend: NetworkTrendPoint[]; // last 90 days
  sparkSpend: number[];
  sparkCtr: number[];
  sparkCpm: number[];
  sparkRoas: number[];
}

export function getNetworkKpis(platform: "meta" | "google"): NetworkKpis {
  const daily = platform === "meta" ? META_DAILY : GOOGLE_DAILY;
  const last28 = windowSlice(daily, 28);
  return {
    cur: aggNetwork(last28),
    prev: aggNetwork(windowSlice(daily, 28, 28)),
    trend: windowSlice(daily, SHOW_DAYS).map((d) => ({
      date: d.date,
      spend: r2(d.spend),
      cpm: d.impressions > 0 ? r2((d.spend / d.impressions) * 1000) : 0,
      cpc: d.clicks > 0 ? r2(d.spend / d.clicks) : 0,
      ctr: d.impressions > 0 ? r4(d.clicks / d.impressions) : 0,
      frequency: d.frequency,
      roas: d.spend > 0 ? r2(d.convValue / d.spend) : 0,
    })),
    sparkSpend: last28.map((d) => d.spend),
    sparkCtr: last28.map((d) => (d.impressions > 0 ? d.clicks / d.impressions : 0)),
    sparkCpm: last28.map((d) => (d.impressions > 0 ? (d.spend / d.impressions) * 1000 : 0)),
    sparkRoas: last28.map((d) => (d.spend > 0 ? d.convValue / d.spend : 0)),
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

function buildStoreDaily(): StoreDay[] {
  const rng = mulberry32(9);
  return DAILY.map((d) => {
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

const STORE_DAILY = buildStoreDaily();

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

export function getStoreKpis(): { cur: StoreStats; prev: StoreStats; daily: StoreDay[] } {
  return {
    cur: aggStore(windowSlice(STORE_DAILY, 28)),
    prev: aggStore(windowSlice(STORE_DAILY, 28, 28)),
    daily: windowSlice(STORE_DAILY, SHOW_DAYS),
  };
}

export interface OverviewKpis {
  mer7: number;
  mer7Prev: number;
  mer28: number;
  mer28Prev: number;
  spend28: number;
  spend28Prev: number;
  revenue28: number;
  revenue28Prev: number;
  sparkMer7: number[];
  sparkSpend: number[];
  sparkRevenue: number[];
  sparkOrders: number[];
}

export function getOverviewKpis(): OverviewKpis {
  const last = DAILY.length - 1;
  const w7 = rollingSum(last, 7);
  const w7p = rollingSum(last - 7, 7);
  const w28 = rollingSum(last, 28);
  const w28p = rollingSum(last - 28, 28);
  const series = getMerSeries().slice(-28);
  return {
    mer7: w7 ? r2(w7.revenue / w7.spend) : 0,
    mer7Prev: w7p ? r2(w7p.revenue / w7p.spend) : 0,
    mer28: w28 ? r2(w28.revenue / w28.spend) : 0,
    mer28Prev: w28p ? r2(w28p.revenue / w28p.spend) : 0,
    spend28: w28 ? r2(w28.spend) : 0,
    spend28Prev: w28p ? r2(w28p.spend) : 0,
    revenue28: w28 ? r2(w28.revenue) : 0,
    revenue28Prev: w28p ? r2(w28p.revenue) : 0,
    sparkMer7: series.map((p) => p.mer7 ?? 0),
    sparkSpend: series.map((p) => p.metaSpend + p.googleSpend),
    sparkRevenue: series.map((p) => p.revenue),
    sparkOrders: windowSlice(STORE_DAILY, 28).map((d) => d.orders),
  };
}

// ---------------------------------------------------------------------------
// Top products (store), with availability status
// ---------------------------------------------------------------------------
export interface Product {
  name: string;
  sku: string;
  units: number;
  revenue: number;
  price: number;
  stock: "in_stock" | "low_stock" | "out_of_stock";
  deltaPct: number; // revenue vs prior 28d
}

export function getTopProducts(): Product[] {
  return [
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
}

// ---------------------------------------------------------------------------
// Funnels
// ---------------------------------------------------------------------------
export interface FunnelStage {
  label: string;
  value: number;
  prev: number;
}

/** Site funnel from GA4 + store: sessions -> add to cart -> checkout -> orders. */
export function getSiteFunnel(): FunnelStage[] {
  const rng = mulberry32(31);
  const build = (offset: number) => {
    const traffic = windowSlice(getTrafficSeriesFull(), 28, offset);
    const sessions = traffic.reduce(
      (s, row) => s + CHANNELS.reduce((t, ch) => t + Number(row[ch] ?? 0), 0),
      0,
    );
    const orders = windowSlice(STORE_DAILY, 28, offset).reduce((s, d) => s + d.orders, 0);
    const atc = Math.round(sessions * (0.079 + rng() * 0.004));
    const checkout = Math.round(atc * (0.6 + rng() * 0.03));
    return { sessions, atc, checkout, orders };
  };
  const cur = build(0);
  const prev = build(28);
  return [
    { label: "Sessions", value: cur.sessions, prev: prev.sessions },
    { label: "Add to cart", value: cur.atc, prev: prev.atc },
    { label: "Checkout started", value: cur.checkout, prev: prev.checkout },
    { label: "Orders", value: cur.orders, prev: prev.orders },
  ];
}

/** Network funnel from the platform's own reporting (diagnostic attribution). */
export function getNetworkFunnel(platform: "meta" | "google"): FunnelStage[] {
  const daily = platform === "meta" ? META_DAILY : GOOGLE_DAILY;
  const cur = aggNetwork(windowSlice(daily, 28));
  const prev = aggNetwork(windowSlice(daily, 28, 28));
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

export function getFunnelTrend(): FunnelTrendPoint[] {
  const rng = mulberry32(77);
  const traffic = getTrafficSeriesFull();
  return traffic
    .map((row, i) => {
      const sessions = CHANNELS.reduce((t, ch) => t + Number(row[ch] ?? 0), 0);
      const store = STORE_DAILY[i];
      const orders = store ? store.orders : 0;
      const atc = Math.round(sessions * (0.075 + rng() * 0.012));
      return {
        date: String(row.date),
        cvr: sessions > 0 ? r4(orders / sessions) : 0,
        abandonment: atc > 0 ? r4(Math.max(0, 1 - orders / atc)) : 0,
      };
    })
    .slice(-SHOW_DAYS);
}

// ---------------------------------------------------------------------------
// Campaign health (28d rollup of mart_campaign_health)
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

export function getCampaignHealth(): CampaignHealth[] {
  const rows: CampaignHealth[] = [
    { platform: "meta", name: "Advantage+ Shopping", spend: 12840, impressions: 622000, clicks: 9800, platformRoas: 3.8, ga4Sessions: 8100, ga4EngagementRate: 0.46, utmMatched: true, health: "scaling" },
    { platform: "meta", name: "Prospecting | Broad Interests", spend: 6420, impressions: 408000, clicks: 5900, platformRoas: 2.1, ga4Sessions: 4900, ga4EngagementRate: 0.38, utmMatched: true, health: "watch" },
    { platform: "google", name: "Performance Max | All Products", spend: 5460, impressions: 182000, clicks: 5200, platformRoas: 3.2, ga4Sessions: 4300, ga4EngagementRate: 0.44, utmMatched: true, health: "healthy" },
    { platform: "meta", name: "Retargeting | 30d Viewers", spend: 4180, impressions: 96000, clicks: 2900, platformRoas: 5.6, ga4Sessions: 2400, ga4EngagementRate: 0.52, utmMatched: true, health: "fatigued" },
    { platform: "google", name: "Non-Brand Search | Core Terms", spend: 3890, impressions: 74000, clicks: 2900, platformRoas: 1.8, ga4Sessions: 2400, ga4EngagementRate: 0.4, utmMatched: true, health: "watch" },
    { platform: "meta", name: "Lookalike 1% | Purchasers", spend: 3350, impressions: 151000, clicks: 2300, platformRoas: 2.9, ga4Sessions: null, ga4EngagementRate: null, utmMatched: false, health: "healthy" },
    { platform: "google", name: "Brand Search", spend: 2980, impressions: 32000, clicks: 2200, platformRoas: 8.4, ga4Sessions: 1900, ga4EngagementRate: 0.61, utmMatched: true, health: "healthy" },
    { platform: "meta", name: "Brand Awareness | Reach", spend: 1240, impressions: 168000, clicks: 800, platformRoas: 0.9, ga4Sessions: 650, ga4EngagementRate: 0.33, utmMatched: true, health: "inefficient" },
  ];
  return rows.sort((a, b) => b.spend - a.spend);
}

export function getUtmMatchRate(): number {
  const meta = getCampaignHealth().filter((c) => c.platform === "meta");
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

export function getMetaAds(): MetaAd[] {
  const rows: MetaAd[] = [
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

export function getCreativeBreakdown(): CreativeSlice[] {
  const ads = getMetaAds();
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

export function getGoogleCampaigns(): GoogleCampaign[] {
  const rows: GoogleCampaign[] = [
    { name: "Performance Max | All Products", type: "Performance Max", spend: 5460, impressions: 182000, clicks: 5200, conversions: 214, convValue: 17470, impressionShare: null, health: "healthy" },
    { name: "Non-Brand Search | Core Terms", type: "Search", spend: 3890, impressions: 74000, clicks: 2900, conversions: 78, convValue: 7000, impressionShare: 0.42, health: "watch" },
    { name: "Brand Search", type: "Search", spend: 2980, impressions: 32000, clicks: 2200, conversions: 189, convValue: 25030, impressionShare: 0.87, health: "healthy" },
  ];
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

export type TrafficDay = Record<string, number | string>;

let trafficCache: TrafficDay[] | null = null;

function getTrafficSeriesFull(): TrafficDay[] {
  if (trafficCache) return trafficCache;
  const rng = mulberry32(7);
  const base: Record<string, number> = {
    "Organic Search": 620,
    "Paid Social": 540,
    "Paid Search": 310,
    "Direct": 280,
    "Email": 150,
    "Referral": 90,
  };
  trafficCache = buildDates().map((date, i) => {
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const growth = 1 + i * 0.0015;
    const row: TrafficDay = { date };
    for (const ch of CHANNELS) {
      let v = (base[ch] ?? 100) * growth * (0.85 + rng() * 0.3);
      if (weekend) v *= ch === "Paid Search" ? 0.75 : ch === "Email" ? 0.7 : 0.95;
      if (ch === "Paid Social" && i >= BUILD_DAYS - 5) v *= 1.5;
      if (ch === "Email" && i % 7 === 3) v *= 2.6;
      row[ch] = Math.round(v);
    }
    return row;
  });
  return trafficCache;
}

export function getTrafficSeries(): TrafficDay[] {
  return getTrafficSeriesFull().slice(-SHOW_DAYS);
}

export interface ChannelSummary {
  channel: string;
  sessions: number;
  engagementRate: number;
  avgSessionDuration: number;
  bounceRate: number;
  newUserShare: number;
}

export function getChannelSummaries(): ChannelSummary[] {
  const series = windowSlice(getTrafficSeriesFull(), 28);
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

export function getAnomalies(): Anomaly[] {
  const dates = buildDates();
  const at = (back: number) => dates[dates.length - 1 - back] ?? "";
  const rows: Anomaly[] = [
    {
      date: at(11),
      kind: "mer_move",
      scope: "Blended",
      impactAbs: 8400,
      narrative:
        "7 day MER fell from 3.4 to 2.4 across three days while spend held steady. Store net revenue dropped about $8,400 against trend. The dip lines up with the checkout errors the store logged in the same window, not with ad performance. Revenue recovered once checkout was fixed.",
    },
    {
      date: at(1),
      kind: "spend_swing",
      scope: "Meta | Advantage+ Shopping",
      impactAbs: 3100,
      narrative:
        "Advantage+ Shopping spend is up roughly $620 per day for five straight days, about $3,100 total. This follows the budget increase on the campaign. Blended 7 day MER has held near 3.2 through the scale-up, so the added spend is converting so far. Watch frequency on the top two ads.",
    },
    {
      date: at(2),
      kind: "conv_rate_drop",
      scope: "Meta | Retargeting | 30d Viewers",
      impactAbs: 1900,
      narrative:
        "Conversion rate on the free shipping reminder ad fell from 2.4% to 1.5% over the last week while frequency climbed to 8.2. Creative fatigue is the likely cause. About $1,900 of weekly spend sits on this ad. A fresh variant or a frequency cap would protect the retargeting pool.",
    },
    {
      date: at(4),
      kind: "spend_swing",
      scope: "Google | Performance Max",
      impactAbs: 740,
      narrative:
        "Performance Max spend dipped $740 against its 7 day average over the weekend, then recovered. Google reports no budget or status changes. This pattern matches normal weekend auction softness for this account and needs no action.",
    },
    {
      date: at(6),
      kind: "conv_rate_drop",
      scope: "Google | Non-Brand Search | Core Terms",
      impactAbs: 520,
      narrative:
        "Click-through rate on Non-Brand Search fell about 12% after the ad rotation on the core terms ad group. Platform conversions are down $520 against trend. The two new responsive ads have weaker headlines than the ones they replaced. Worth reverting or testing new copy.",
    },
  ];
  return rows.sort((a, b) => b.impactAbs - a.impactAbs);
}

export const DEMO_CLIENT = { name: "Acme Outdoors", slug: "acme-outdoors" };
