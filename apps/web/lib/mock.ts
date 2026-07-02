/**
 * Demo data layer. Shapes mirror the marts the dashboard will read
 * (mart_mer_rolling, mart_campaign_health, fact_ga4_traffic, fact_ad_daily,
 * mart_anomalies). When the pipeline lands, replace this module with real
 * queries; page components should not change.
 *
 * Data is generated deterministically (seeded RNG) with two planted stories:
 * a revenue dip 10-12 days ago (checkout outage) and a Meta spend scale-up
 * over the last 5 days.
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

const BUILD_DAYS = 120; // extra history so 28d windows are full across the visible 90
const SHOW_DAYS = 90;

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

export interface DailyFact {
  date: string;
  metaSpend: number;
  googleSpend: number;
  revenue: number; // store net revenue (the only revenue source, Invariant 1)
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

export interface OverviewKpis {
  mer7: number;
  mer28: number;
  spend28: number;
  revenue28: number;
  orders28: number;
  spend28Prev: number;
  revenue28Prev: number;
}

export function getOverviewKpis(): OverviewKpis {
  const last = DAILY.length - 1;
  const w7 = rollingSum(last, 7);
  const w28 = rollingSum(last, 28);
  const prev = rollingSum(last - 28, 28);
  const orders28 = DAILY.slice(-28).reduce((s, d) => s + d.orders, 0);
  return {
    mer7: w7 ? r2(w7.revenue / w7.spend) : 0,
    mer28: w28 ? r2(w28.revenue / w28.spend) : 0,
    spend28: w28 ? r2(w28.spend) : 0,
    revenue28: w28 ? r2(w28.revenue) : 0,
    orders28,
    spend28Prev: prev ? r2(prev.spend) : 0,
    revenue28Prev: prev ? r2(prev.revenue) : 0,
  };
}

// --------------------------------------------------------------------------
// Campaign health (28d rollup of mart_campaign_health)
// --------------------------------------------------------------------------
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
  /** Meta side of the GA4 join is UTM-dependent; false means degraded. */
  utmMatched: boolean;
}

export function getCampaignHealth(): CampaignHealth[] {
  const rows: CampaignHealth[] = [
    { platform: "meta", name: "Advantage+ Shopping", spend: 12840, impressions: 1620000, clicks: 31400, platformRoas: 3.8, ga4Sessions: 24600, ga4EngagementRate: 0.46, utmMatched: true },
    { platform: "meta", name: "Prospecting | Broad Interests", spend: 6420, impressions: 1180000, clicks: 19100, platformRoas: 2.1, ga4Sessions: 15800, ga4EngagementRate: 0.38, utmMatched: true },
    { platform: "google", name: "Performance Max | All Products", spend: 5460, impressions: 890000, clicks: 14600, platformRoas: 3.2, ga4Sessions: 12800, ga4EngagementRate: 0.44, utmMatched: true },
    { platform: "meta", name: "Retargeting | 30d Viewers", spend: 4180, impressions: 410000, clicks: 9800, platformRoas: 5.6, ga4Sessions: 8900, ga4EngagementRate: 0.52, utmMatched: true },
    { platform: "google", name: "Non-Brand Search | Core Terms", spend: 3890, impressions: 260000, clicks: 8200, platformRoas: 1.8, ga4Sessions: 6900, ga4EngagementRate: 0.4, utmMatched: true },
    { platform: "meta", name: "Lookalike 1% | Purchasers", spend: 3350, impressions: 540000, clicks: 8700, platformRoas: 2.9, ga4Sessions: null, ga4EngagementRate: null, utmMatched: false },
    { platform: "google", name: "Brand Search", spend: 2980, impressions: 98000, clicks: 6100, platformRoas: 8.4, ga4Sessions: 7200, ga4EngagementRate: 0.61, utmMatched: true },
    { platform: "meta", name: "Brand Awareness | Reach", spend: 1240, impressions: 720000, clicks: 3900, platformRoas: 0.9, ga4Sessions: 3100, ga4EngagementRate: 0.33, utmMatched: true },
  ];
  return rows.sort((a, b) => b.spend - a.spend);
}

/** Share of Meta spend on campaigns whose utm_campaign matches GA4. */
export function getUtmMatchRate(): number {
  const meta = getCampaignHealth().filter((c) => c.platform === "meta");
  const total = meta.reduce((s, c) => s + c.spend, 0);
  const matched = meta.filter((c) => c.utmMatched).reduce((s, c) => s + c.spend, 0);
  return total > 0 ? matched / total : 0;
}

// --------------------------------------------------------------------------
// Meta ad-level drill-down (fact_ad_daily, platform='meta', 28d rollup)
// --------------------------------------------------------------------------
export interface MetaAd {
  campaign: string;
  adset: string;
  name: string;
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
    { campaign: "Advantage+ Shopping", adset: "Advantage+ | Auto", name: "UGC Video | Sarah unboxing v2", status: "ACTIVE", spend: 4620, impressions: 588000, clicks: 12400, purchases: 168, convValue: 19100, frequency: 2.4 },
    { campaign: "Advantage+ Shopping", adset: "Advantage+ | Auto", name: "Static | Summer bundle 20% off", status: "ACTIVE", spend: 3980, impressions: 502000, clicks: 9200, purchases: 121, convValue: 13600, frequency: 2.1 },
    { campaign: "Advantage+ Shopping", adset: "Advantage+ | Auto", name: "Carousel | Top sellers Q2", status: "ACTIVE", spend: 2710, impressions: 341000, clicks: 6300, purchases: 74, convValue: 8400, frequency: 1.9 },
    { campaign: "Advantage+ Shopping", adset: "Advantage+ | Auto", name: "UGC Video | Mike review 15s", status: "PAUSED", spend: 1530, impressions: 189000, clicks: 3500, purchases: 29, convValue: 3200, frequency: 3.1 },
    { campaign: "Prospecting | Broad Interests", adset: "Broad | US 25-54", name: "Video | Founder story 30s", status: "ACTIVE", spend: 2840, impressions: 522000, clicks: 8600, purchases: 52, convValue: 5900, frequency: 1.6 },
    { campaign: "Prospecting | Broad Interests", adset: "Broad | US 25-54", name: "Static | Problem-solution v3", status: "ACTIVE", spend: 2260, impressions: 415000, clicks: 6900, purchases: 41, convValue: 4700, frequency: 1.7 },
    { campaign: "Prospecting | Broad Interests", adset: "Interests | Outdoor", name: "Carousel | Use cases", status: "PAUSED", spend: 1320, impressions: 243000, clicks: 3600, purchases: 18, convValue: 2000, frequency: 2.2 },
    { campaign: "Retargeting | 30d Viewers", adset: "Viewers 30d | Exclude buyers", name: "DPA | Viewed products", status: "ACTIVE", spend: 2380, impressions: 214000, clicks: 5600, purchases: 118, convValue: 13300, frequency: 6.8 },
    { campaign: "Retargeting | 30d Viewers", adset: "Viewers 30d | Exclude buyers", name: "Static | Free shipping reminder", status: "ACTIVE", spend: 1800, impressions: 196000, clicks: 4200, purchases: 79, convValue: 8900, frequency: 8.2 },
    { campaign: "Lookalike 1% | Purchasers", adset: "LAL 1% | US", name: "UGC Video | Sarah unboxing v2", status: "ACTIVE", spend: 1980, impressions: 322000, clicks: 5100, purchases: 47, convValue: 5300, frequency: 1.8 },
    { campaign: "Lookalike 1% | Purchasers", adset: "LAL 1% | US", name: "Static | Press logos", status: "ACTIVE", spend: 1370, impressions: 218000, clicks: 3600, purchases: 30, convValue: 3400, frequency: 1.9 },
    { campaign: "Brand Awareness | Reach", adset: "Reach | US broad", name: "Video | Brand anthem 15s", status: "ACTIVE", spend: 1240, impressions: 720000, clicks: 3900, purchases: 10, convValue: 1100, frequency: 1.3 },
  ];
  return rows.sort((a, b) => b.spend - a.spend);
}

// --------------------------------------------------------------------------
// Site traffic health (fact_ga4_traffic; no crosswalk needed)
// --------------------------------------------------------------------------
export const CHANNELS = [
  "Organic Search",
  "Paid Social",
  "Paid Search",
  "Direct",
  "Email",
  "Referral",
] as const;

export type TrafficDay = Record<string, number | string>;

export function getTrafficSeries(): TrafficDay[] {
  const rng = mulberry32(7);
  const base: Record<string, number> = {
    "Organic Search": 620,
    "Paid Social": 540,
    "Paid Search": 310,
    "Direct": 280,
    "Email": 150,
    "Referral": 90,
  };
  return buildDates()
    .map((date, i) => {
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      const weekend = dow === 0 || dow === 6;
      const growth = 1 + i * 0.0015;
      const row: TrafficDay = { date };
      for (const ch of CHANNELS) {
        let v = (base[ch] ?? 100) * growth * (0.85 + rng() * 0.3);
        if (weekend) v *= ch === "Paid Search" ? 0.75 : ch === "Email" ? 0.7 : 0.95;
        if (ch === "Paid Social" && i >= BUILD_DAYS - 5) v *= 1.5; // Meta scale-up shows up in sessions
        if (ch === "Email" && i % 7 === 3) v *= 2.6; // weekly campaign send
        row[ch] = Math.round(v);
      }
      return row;
    })
    .slice(-SHOW_DAYS);
}

export interface ChannelSummary {
  channel: string;
  sessions: number;
  engagementRate: number;
  avgSessionDuration: number; // seconds
  bounceRate: number;
  newUserShare: number;
}

export function getChannelSummaries(): ChannelSummary[] {
  const series = getTrafficSeries().slice(-28);
  const totals: Record<string, number> = {};
  for (const row of series) {
    for (const ch of CHANNELS) {
      totals[ch] = (totals[ch] ?? 0) + Number(row[ch] ?? 0);
    }
  }
  const quality: Record<string, [number, number, number, number]> = {
    // engagementRate, avgDuration, bounceRate, newUserShare
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

// --------------------------------------------------------------------------
// Anomalies (mart_anomalies), ranked by absolute impact, not percentage.
// Narratives: plain, direct language. No em dashes, no filler.
// --------------------------------------------------------------------------
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
