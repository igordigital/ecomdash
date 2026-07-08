/**
 * Google Ads API (GAQL) report fetching, campaign + ad_group grain (v1
 * scope, matching fact_ad_daily's existing comment: Google has no per-ad
 * breakdown at this grain, unlike Meta). Every real call needs three
 * headers: the OAuth access token, the static developer token
 * (GOOGLE_ADS_DEVELOPER_TOKEN), and login-customer-id set to the agency's
 * MCC (GOOGLE_ADS_MCC_ID) -- the account being queried is a client under
 * that MCC, not the MCC itself.
 */

import { normalizedMccId } from "./google-ads-oauth";

const API_VERSION = "v19";
const API_BASE = `https://googleads.googleapis.com/${API_VERSION}`;

function requireDeveloperToken(): string {
  const token = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!token) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN is required");
  return token;
}

interface SearchResponse<T> {
  results?: T[];
  nextPageToken?: string;
}

async function gaqlSearch<T>(accessToken: string, customerId: string, query: string): Promise<T[]> {
  const mccId = normalizedMccId();
  const developerToken = requireDeveloperToken();
  const rows: T[] = [];
  let pageToken: string | undefined;

  do {
    const res = await fetch(`${API_BASE}/customers/${customerId}/googleAds:search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "login-customer-id": mccId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, pageToken }),
    });
    if (!res.ok) throw new Error(`Google Ads query failed: ${res.status} ${await res.text()}`);
    const json: SearchResponse<T> = await res.json();
    rows.push(...(json.results ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken);

  return rows;
}

export async function fetchGoogleAdsAccountCurrency(accessToken: string, customerId: string): Promise<string> {
  const rows = await gaqlSearch<{ customer: { currencyCode?: string } }>(
    accessToken,
    customerId,
    "SELECT customer.currency_code FROM customer LIMIT 1",
  );
  return rows[0]?.customer.currencyCode ?? "USD";
}

export interface GoogleAdsCampaignReportRow {
  date: string;
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  impressionShare: number | null;
}

interface AdGroupRow {
  campaign: { id: string; name: string };
  adGroup: { id: string; name: string };
  metrics: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    conversions?: number;
    conversionsValue?: number;
  };
  segments: { date: string };
}

interface CampaignImpressionShareRow {
  campaign: { id: string };
  metrics: { searchImpressionShare?: number };
}

/** search_impression_share only exists on the campaign resource (Search campaigns only), not ad_group -- fetched separately and merged in by campaign id. */
async function fetchImpressionShareByCampaign(accessToken: string, customerId: string, date: string): Promise<Map<string, number>> {
  const rows = await gaqlSearch<CampaignImpressionShareRow>(
    accessToken,
    customerId,
    `SELECT campaign.id, metrics.search_impression_share FROM campaign WHERE segments.date = '${date}' AND campaign.advertising_channel_type = 'SEARCH'`,
  );
  const byCampaign = new Map<string, number>();
  for (const r of rows) {
    if (typeof r.metrics.searchImpressionShare === "number") {
      byCampaign.set(r.campaign.id, r.metrics.searchImpressionShare);
    }
  }
  return byCampaign;
}

export async function fetchGoogleAdsCampaignReport(accessToken: string, customerId: string, date: string): Promise<GoogleAdsCampaignReportRow[]> {
  const [adGroupRows, impressionShareByCampaign] = await Promise.all([
    gaqlSearch<AdGroupRow>(
      accessToken,
      customerId,
      `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, segments.date FROM ad_group WHERE segments.date = '${date}'`,
    ),
    fetchImpressionShareByCampaign(accessToken, customerId, date),
  ]);

  return adGroupRows.map((r) => ({
    date: r.segments.date,
    campaignId: r.campaign.id,
    campaignName: r.campaign.name,
    adGroupId: r.adGroup.id,
    adGroupName: r.adGroup.name,
    spend: Number(r.metrics.costMicros ?? 0) / 1_000_000,
    impressions: Number(r.metrics.impressions ?? 0),
    clicks: Number(r.metrics.clicks ?? 0),
    conversions: r.metrics.conversions ?? 0,
    conversionValue: r.metrics.conversionsValue ?? 0,
    impressionShare: impressionShareByCampaign.get(r.campaign.id) ?? null,
  }));
}
