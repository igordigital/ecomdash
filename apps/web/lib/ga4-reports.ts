/**
 * GA4 Data API report fetching, for the two report shapes the warehouse
 * models (see packages/connectors/ga4 for the original design notes this
 * mirrors). One day per call: matches the ingest_jobs grain (one row per
 * day per source) and avoids GA4's sampling/row-cap behavior on wider
 * ranges.
 */

interface RunReportResponse {
  dimensionHeaders?: { name: string }[];
  metricHeaders?: { name: string }[];
  rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
}

async function runReport(
  accessToken: string,
  propertyId: string,
  date: string,
  dimensions: string[],
  metrics: string[],
): Promise<Record<string, string>[]> {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: date, endDate: date }],
      dimensions: dimensions.map((name) => ({ name })),
      metrics: metrics.map((name) => ({ name })),
      limit: 100000,
    }),
  });
  if (!res.ok) throw new Error(`GA4 runReport failed: ${res.status} ${await res.text()}`);
  const json: RunReportResponse = await res.json();
  const dimNames = (json.dimensionHeaders ?? []).map((h) => h.name);
  const metricNames = (json.metricHeaders ?? []).map((h) => h.name);
  return (json.rows ?? []).map((row) => {
    const out: Record<string, string> = {};
    row.dimensionValues.forEach((v, i) => (out[dimNames[i]!] = v.value));
    row.metricValues.forEach((v, i) => (out[metricNames[i]!] = v.value));
    return out;
  });
}

export interface Ga4TrafficReportRow {
  date: string;
  channelGroup: string;
  sourceMedium: string;
  sessions: number;
  engagedSessions: number;
  engagementRate: number;
  avgSessionDuration: number;
  bounceRate: number;
  newUsers: number;
  totalUsers: number;
}

const ymdToIso = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

export async function fetchGa4TrafficReport(accessToken: string, propertyId: string, date: string): Promise<Ga4TrafficReportRow[]> {
  const rows = await runReport(
    accessToken,
    propertyId,
    date,
    ["date", "sessionDefaultChannelGroup", "sessionSourceMedium"],
    ["sessions", "engagedSessions", "engagementRate", "averageSessionDuration", "bounceRate", "newUsers", "totalUsers"],
  );
  return rows.map((r) => ({
    date: ymdToIso(r.date!),
    channelGroup: r.sessionDefaultChannelGroup ?? "(not set)",
    sourceMedium: r.sessionSourceMedium ?? "(not set)",
    sessions: Number(r.sessions ?? 0),
    engagedSessions: Number(r.engagedSessions ?? 0),
    engagementRate: Number(r.engagementRate ?? 0),
    avgSessionDuration: Number(r.averageSessionDuration ?? 0),
    bounceRate: Number(r.bounceRate ?? 0),
    newUsers: Number(r.newUsers ?? 0),
    totalUsers: Number(r.totalUsers ?? 0),
  }));
}

export interface Ga4CampaignReportRow {
  date: string;
  sourceMedium: string;
  campaign: string;
  device: string;
  sessions: number;
  engagedSessions: number;
  engagementRate: number;
  conversions: number;
  revenue: number;
}

export async function fetchGa4CampaignReport(accessToken: string, propertyId: string, date: string): Promise<Ga4CampaignReportRow[]> {
  const rows = await runReport(
    accessToken,
    propertyId,
    date,
    ["date", "sessionSourceMedium", "sessionCampaignName", "deviceCategory"],
    ["sessions", "engagedSessions", "engagementRate", "conversions", "totalRevenue"],
  );
  return rows.map((r) => ({
    date: ymdToIso(r.date!),
    sourceMedium: r.sessionSourceMedium ?? "(not set)",
    campaign: r.sessionCampaignName ?? "(not set)",
    device: r.deviceCategory ?? "(not set)",
    sessions: Number(r.sessions ?? 0),
    engagedSessions: Number(r.engagedSessions ?? 0),
    engagementRate: Number(r.engagementRate ?? 0),
    conversions: Number(r.conversions ?? 0),
    revenue: Number(r.totalRevenue ?? 0),
  }));
}
