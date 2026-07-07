import { MetricTrend } from "@/components/charts";
import { RangeSelector } from "@/components/range-selector";
import { Badge, Card, Funnel, HealthChip, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { fmtNum, fmtNumCompact, fmtPct, fmtRatio, makeCurrencyFormatters } from "@/lib/format";
import { resolveRange, type RangeSearchParams } from "@/lib/range";
import { resolveViewedClientId } from "@/lib/viewed-client";
import { getClientCurrency, getEarliestDate, getGoogleCampaigns, getLatestDate, getNetworkFunnel, getNetworkKpis } from "@/lib/dashboard-data";

export default async function GooglePage({ searchParams }: { searchParams: Promise<RangeSearchParams> }) {
  const sp = await searchParams;
  const earliestDate = getEarliestDate();
  const latestDate = getLatestDate();
  const range = resolveRange(sp, { earliest: earliestDate, latest: latestDate });
  const clientId = await resolveViewedClientId(sp.clientId);

  const [networkKpis, funnel, campaigns, currency] = await Promise.all([
    getNetworkKpis(clientId, "google", range),
    getNetworkFunnel(clientId, "google", range),
    getGoogleCampaigns(clientId, range),
    getClientCurrency(clientId),
  ]);
  const { fmtUsd, fmtUsdCompact, fmtUsdPrecise } = makeCurrencyFormatters(currency);
  const { cur, prev, trend, sparkSpend, sparkRoas } = networkKpis;

  return (
    <>
      <PageHeader
        title="Google Ads"
        description="Network deep dive at campaign and ad group grain. Conversions and values are Google's attribution, including modeled conversions: diagnostic, never added to other platforms."
        right={
          <div className="flex items-center gap-2">
            <Badge tone="warn">platform reported</Badge>
            <RangeSelector current={range} pathname="/google" earliestDate={earliestDate} latestDate={latestDate} />
          </div>
        }
      />

      <SectionTitle hint={`${range.label}, ${range.compareLabel}.`}>Network KPIs</SectionTitle>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Spend" value={fmtUsdCompact(cur.spend)} current={cur.spend} previous={prev.spend} spark={sparkSpend} sparkColor="#34d399" />
        <StatCard label="CPC" value={fmtUsdPrecise(cur.cpc)} current={cur.cpc} previous={prev.cpc} invert />
        <StatCard label="CTR" value={fmtPct(cur.ctr)} current={cur.ctr} previous={prev.ctr} />
        <StatCard label="Clicks" value={fmtNumCompact(cur.clicks)} current={cur.clicks} previous={prev.clicks} />
        <StatCard label="Conversions (diag)" value={fmtNum(cur.purchases)} current={cur.purchases} previous={prev.purchases} />
        <StatCard label="Click conv. rate" value={fmtPct(cur.clickCvr)} current={cur.clickCvr} previous={prev.clickCvr} />
        <StatCard
          label="Cost / conv (diag)"
          value={cur.cpa !== null ? fmtUsd(cur.cpa) : "n/a"}
          current={cur.cpa ?? 0}
          previous={prev.cpa ?? 0}
          invert
        />
        <StatCard label="ROAS (diag)" value={fmtRatio(cur.roas)} current={cur.roas} previous={prev.roas} spark={sparkRoas} sparkColor="#a78bfa" />
      </div>

      <SectionTitle>Trends</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Daily spend">
          <MetricTrend data={trend} series={[{ key: "spend", name: "Spend", color: "#34d399" }]} fmt="usd" currency={currency} />
        </Card>
        <Card title="CPC">
          <MetricTrend data={trend} series={[{ key: "cpc", name: "CPC", color: "#f59e0b" }]} fmt="usd" currency={currency} />
        </Card>
      </div>

      <SectionTitle>Funnel</SectionTitle>
      <Card subtitle={`Google reported events, ${range.label.toLowerCase()}, deltas ${range.compareLabel}.`}>
        <Funnel stages={funnel} />
      </Card>

      <SectionTitle hint="Impression share only applies to Search; PMax does not report it comparably.">
        Campaigns
      </SectionTitle>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-4 font-medium">Campaign</th>
                <th className="pb-2 pr-4 font-medium">Type</th>
                <th className="pb-2 pr-4 font-medium">Health</th>
                <th className="pb-2 pr-4 text-right font-medium">Spend</th>
                <th className="pb-2 pr-4 text-right font-medium">CTR</th>
                <th className="pb-2 pr-4 text-right font-medium">Conv. (diag)</th>
                <th className="pb-2 pr-4 text-right font-medium">ROAS (diag)</th>
                <th className="pb-2 font-medium">Impr. share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {campaigns.map((c) => (
                <tr key={c.name} className="text-slate-300">
                  <td className="py-2.5 pr-4 font-medium text-slate-200">{c.name}</td>
                  <td className="py-2.5 pr-4 text-xs text-slate-400">{c.type}</td>
                  <td className="py-2.5 pr-4">
                    <HealthChip health={c.health} />
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtUsd(c.spend)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">
                    {c.impressions > 0 ? fmtPct(c.clicks / c.impressions) : "n/a"}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtNum(c.conversions)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">
                    {c.spend > 0 ? fmtRatio(c.convValue / c.spend) : "n/a"}
                  </td>
                  <td className="py-2.5">
                    {c.impressionShare !== null ? (
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-24 overflow-hidden rounded bg-slate-800">
                          <span
                            className="block h-full rounded bg-emerald-500/80"
                            style={{ width: `${c.impressionShare * 100}%` }}
                          />
                        </span>
                        <span className="text-xs tabular-nums text-slate-400">{fmtPct(c.impressionShare)}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-600">n/a (PMax)</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Non-Brand Search at 42% impression share means roughly half the demand is unbought: budget headroom if
          efficiency holds at target.
        </p>
      </Card>
    </>
  );
}
