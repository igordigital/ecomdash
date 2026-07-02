import { MetricTrend } from "../../components/charts";
import { Badge, Card, Funnel, PageHeader, SectionTitle } from "../../components/ui";
import { fmtNumCompact, fmtPct } from "../../lib/format";
import { getFunnelTrend, getNetworkFunnel, getNetworkKpis, getSiteFunnel } from "../../lib/mock";

export default function FunnelPage() {
  const site = getSiteFunnel();
  const metaFunnel = getNetworkFunnel("meta");
  const googleFunnel = getNetworkFunnel("google");
  const meta = getNetworkKpis("meta");
  const google = getNetworkKpis("google");
  const trend = getFunnelTrend();

  const sessions = site[0]?.value ?? 0;
  const orders = site.at(-1)?.value ?? 0;
  const cvr = sessions > 0 ? orders / sessions : 0;

  return (
    <>
      <PageHeader
        title="Funnel"
        description="Where visits become orders and where they leak. The site funnel uses GA4 sessions and store orders. Network funnels use each platform's own event reporting and inherit its attribution."
        right={<Badge tone="neutral">last 28 days</Badge>}
      />

      <SectionTitle hint={`Upstream paid reach: ${fmtNumCompact(meta.cur.impressions + google.cur.impressions)} impressions, ${fmtNumCompact(meta.cur.clicks + google.cur.clicks)} paid clicks across networks.`}>
        Site funnel
      </SectionTitle>
      <Card subtitle={`Session to order conversion: ${fmtPct(cvr)}. Deltas compare to the prior 28 days.`}>
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
