import { MetricTrend } from "@/components/charts";
import { RangeSelector } from "@/components/range-selector";
import { Card, Funnel, PageHeader, SectionTitle } from "@/components/ui";
import { fmtNumCompact, fmtPct } from "@/lib/format";
import { resolveRange, type RangeSearchParams } from "@/lib/range";
import { resolveViewedClientId } from "@/lib/viewed-client";
import {
  getEarliestDate,
  getFunnelTrend,
  getLatestDate,
  getNetworkFunnel,
  getNetworkKpis,
  getSiteFunnel,
} from "@/lib/dashboard-data";

export default async function FunnelPage({ searchParams }: { searchParams: Promise<RangeSearchParams> }) {
  const sp = await searchParams;
  const earliestDate = getEarliestDate();
  const latestDate = getLatestDate();
  const range = resolveRange(sp, { earliest: earliestDate, latest: latestDate });
  const clientId = await resolveViewedClientId(sp.clientId);

  const [site, metaFunnel, googleFunnel, meta, google, trend] = await Promise.all([
    getSiteFunnel(clientId, range),
    getNetworkFunnel(clientId, "meta", range),
    getNetworkFunnel(clientId, "google", range),
    getNetworkKpis(clientId, "meta", range),
    getNetworkKpis(clientId, "google", range),
    getFunnelTrend(clientId, range),
  ]);

  const sessions = site[0]?.value ?? 0;
  const orders = site.at(-1)?.value ?? 0;
  const cvr = sessions > 0 ? orders / sessions : 0;

  return (
    <>
      <PageHeader
        title="Funnel"
        description="Where visits become orders and where they leak. The site funnel uses GA4 sessions and store orders. Network funnels use each platform's own event reporting and inherit its attribution."
        right={<RangeSelector current={range} pathname="/funnel" earliestDate={earliestDate} latestDate={latestDate} />}
      />

      <SectionTitle
        hint={`Upstream paid reach: ${fmtNumCompact(meta.cur.impressions + google.cur.impressions)} impressions, ${fmtNumCompact(
          meta.cur.clicks + google.cur.clicks,
        )} paid clicks across networks, ${range.label.toLowerCase()}.`}
      >
        Site funnel
      </SectionTitle>
      <Card subtitle={`Session to order conversion: ${fmtPct(cvr)}. Deltas ${range.compareLabel}.`}>
        <Funnel stages={site} />
      </Card>

      <SectionTitle hint="Platform reported events, diagnostic attribution. Compare shapes, not totals: both networks claim overlapping orders.">
        Network funnels
      </SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Meta" subtitle="Impressions to platform-attributed purchases.">
          <Funnel stages={metaFunnel} />
        </Card>
        <Card title="Google" subtitle="Impressions to platform-attributed conversions.">
          <Funnel stages={googleFunnel} />
        </Card>
      </div>

      <SectionTitle>Conversion trends</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Session to order CVR" subtitle="Store orders over GA4 sessions, daily.">
          <MetricTrend data={trend} series={[{ key: "cvr", name: "CVR", color: "#34d399" }]} fmt="pct" />
        </Card>
        <Card title="Cart abandonment" subtitle="Share of add-to-carts that never become orders.">
          <MetricTrend
            data={trend}
            series={[{ key: "abandonment", name: "Abandonment", color: "#f87171" }]}
            fmt="pct"
          />
        </Card>
      </div>
    </>
  );
}
