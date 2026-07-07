/**
 * Meta Marketing API Insights fetching, ad grain (campaign + adset + ad in
 * one request), one day per call to match the ingest_jobs grain. Unlike
 * GA4 this only needs one report shape: campaign- and network-level views
 * are aggregated from these ad-grain rows by the existing dashboard-data.ts
 * queries, the same way fact_ad_daily already worked for the mock layer.
 */

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

interface MetaAction {
  action_type: string;
  value: string;
}

interface InsightsRow {
  campaign_id: string;
  campaign_name?: string;
  adset_id: string;
  adset_name?: string;
  ad_id: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
}

interface InsightsResponse {
  data?: InsightsRow[];
  paging?: { next?: string };
}

/**
 * Meta's action_type taxonomy varies a lot by account (omni_purchase,
 * offsite_conversion.fb_pixel_purchase, onsite_web_purchase, custom pixel
 * names, etc.) depending on how the client's conversions are tracked.
 * Substring matching is deliberately broad rather than an exact allowlist,
 * since a narrower list silently under-counts on accounts using a naming
 * variant we didn't anticipate; the tradeoff is a small over-count risk on
 * oddly-named custom events, which is the safer failure mode here.
 */
function sumActions(actions: MetaAction[] | undefined, matches: (type: string) => boolean): number {
  if (!actions) return 0;
  return actions.filter((a) => matches(a.action_type.toLowerCase())).reduce((s, a) => s + Number(a.value ?? 0), 0);
}
const isPurchase = (t: string) => t.includes("purchase");
const isAddToCart = (t: string) => t.includes("add_to_cart");
const isInitiateCheckout = (t: string) => t.includes("initiate_checkout") || t.includes("initiated_checkout");

export interface MetaAdInsightRow {
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  adId: string;
  adName: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  purchases: number;
  purchaseValue: number;
  addToCarts: number;
  checkoutsInitiated: number;
}

export async function fetchMetaAdInsights(accessToken: string, accountId: string, date: string): Promise<MetaAdInsightRow[]> {
  const fields = "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,reach,actions,action_values";
  const timeRange = encodeURIComponent(JSON.stringify({ since: date, until: date }));
  let url: string | undefined =
    `${GRAPH_BASE}/${accountId}/insights?level=ad&fields=${fields}&time_range=${timeRange}&limit=500&access_token=${encodeURIComponent(accessToken)}`;

  const rows: MetaAdInsightRow[] = [];
  for (let page = 0; page < 20 && url; page++) {
    const res: Response = await fetch(url);
    if (!res.ok) throw new Error(`Meta insights failed: ${res.status} ${await res.text()}`);
    const json: InsightsResponse = await res.json();
    for (const r of json.data ?? []) {
      rows.push({
        campaignId: r.campaign_id,
        campaignName: r.campaign_name ?? "",
        adsetId: r.adset_id,
        adsetName: r.adset_name ?? "",
        adId: r.ad_id,
        adName: r.ad_name ?? "",
        spend: Number(r.spend ?? 0),
        impressions: Number(r.impressions ?? 0),
        clicks: Number(r.clicks ?? 0),
        reach: Number(r.reach ?? 0),
        purchases: sumActions(r.actions, isPurchase),
        purchaseValue: sumActions(r.action_values, isPurchase),
        addToCarts: sumActions(r.actions, isAddToCart),
        checkoutsInitiated: sumActions(r.actions, isInitiateCheckout),
      });
    }
    url = json.paging?.next;
  }
  return rows;
}

export async function fetchMetaAdAccountCurrency(accessToken: string, accountId: string): Promise<string> {
  const res = await fetch(`${GRAPH_BASE}/${accountId}?fields=currency&access_token=${encodeURIComponent(accessToken)}`);
  if (!res.ok) throw new Error(`Meta account currency lookup failed: ${res.status} ${await res.text()}`);
  const json: { currency?: string } = await res.json();
  return json.currency ?? "USD";
}
