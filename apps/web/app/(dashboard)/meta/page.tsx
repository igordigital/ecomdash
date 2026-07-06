import { MetricTrend } from "@/components/charts";
import { RangeSelector } from "@/components/range-selector";
import {
  Badge,
  Card,
  Funnel,
  HealthChip,
  PageHeader,
  SectionTitle,
  ShareBar,
  StatCard,
} from "@/components/ui";
import { fmtNum, fmtNumCompact, fmtPct, fmtRatio, fmtUsd, fmtUsdCompact } from "@/lib/format";
import { resolveRange, type RangeSearchParams } from "@/lib/range";
import {
  getCampaignHealth,
  getCreativeBreakdown,
  getEarliestDate,
  getLatestDate,
  getMetaAds,
  getNetworkFunnel,
  getNetworkKpis,
  getUtmMatchRate,
} from "@/lib/mock";

const CREATIVE_COLORS: Record<string, string> = {
  "UGC video": "#38bdf8",
  "Static": "#34d399",
  "Carousel": "#a78bfa",
  "DPA": "#f59e0b",
  "Brand video": "#f472b6",
};

export default async function MetaPage({ searchParams }: { searchParams: Promise<RangeSearchParams> }) {
  const earliestDate = getEarliestDate();
  const latestDate = getLatestDate();
  const range = resolveRange(await searchParams, { earliest: earliestDate, latest: latestDate });

  const { cur, prev, trend, sparkSpend, sparkCtr, sparkCpm, sparkRoas } = getNetworkKpis("meta", range);
  const funnel = getNetworkFunnel("meta", range);
  const creatives = getCreativeBreakdown(range);
  const campaigns = getCampaignHealth(range).filter((c) => c.platform === "meta");
  const ads = getMetaAds(range);
  const matchRate = getUtmMatchRate(range);

  return (
    <>
      <PageHeader
        title="Meta"
        description="Network deep dive. Conversions, values, CPA and ROAS are Meta's own attribution (7d click, 1d view): diagnostic, never added to other platforms."
        right={
          <div className="flex items-center gap-2">
            <Badge tone="warn">platform reported</Badge>
            <RangeSelector current={range} pathname="/meta" earliestDate={earliestDate} latestDate={latestDate} />
          </div>
        }
      />

      <SectionTitle hint={`${range.label}, ${range.compareLabel}.`}>Network KPIs</SectionTitle>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Spend" value={fmtUsdCompact(cur.spend)} current={cur.spend} previous={prev.spend} spark={sparkSpend} />
        <StatCard label="CPM" value={fmtUsd(cur.cpm)} current={cur.cpm} previous={prev.cpm} invert spark={sparkCpm} sparkColor="#f59e0b" />
        <StatCard label="CPC" value={`$${cur.cpc.toFixed(2)}`} current={cur.cpc} previous={prev.cpc} invert />
        <StatCard label="CTR" value={fmtPct(cur.ctr)} current={cur.ctr} previous={prev.ctr} spark={sparkCtr} sparkColor="#34d399" />
        <StatCard label="Reach" value={fmtNumCompact(cur.reach)} current={cur.reach} previous={prev.reach} />
        <StatCard
          label="Frequency"
          value={cur.frequency.toFixed(1)}
          current={cur.frequency}
          previous={prev.frequency}
          invert
          hint="avg per day"
        />
        <StatCard
          label="CPA (diag)"
          value={cur.cpa !== null ? fmtUsd(cur.cpa) : "n/a"}
          current={cur.cpa ?? 0}
          previous={prev.cpa ?? 0}
          invert
        />
        <StatCard label="ROAS (diag)" value={fmtRatio(cur.roas)} current={cur.roas} previous={prev.roas} spark={sparkRoas} sparkColor="#a78bfa" />
      </div>
      <p className="mt-2 text-xs text-slate-600">
        Cost per add to cart {cur.costPerAtc !== null ? fmtUsd(cur.costPerAtc) : "n/a"} | click to purchase{" "}
        {fmtPct(cur.clickCvr)} | {fmtNumCompact(cur.impressions)} impressions, {fmtNumCompact(cur.clicks)} link clicks
      </p>

      <SectionTitle>Cost and engagement trends</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Daily spend">
          <MetricTrend data={trend} series={[{ key: "spend", name: "Spend", color: "#38bdf8" }]} fmt="usd" />
        </Card>
        <Card title="CTR" subtitle="Softening CTR during the scale-up is expected; watch it against frequency.">
          <MetricTrend data={trend} series={[{ key: "ctr", name: "CTR", color: "#34d399" }]} fmt="pct" />
        </Card>
        <Card title="CPM and CPC">
          <MetricTrend
            data={trend}
            series={[
              { key: "cpm", name: "CPM", color: "#f59e0b" },
              { key: "cpc", name: "CPC", color: "#f472b6" },
            ]}
            fmt="usd"
          />
        </Card>
        <Card title="Frequency and ROAS (diag)">
          <MetricTrend
            data={trend}
            series={[
              { key: "frequency", name: "Frequency", color: "#f87171" },
              { key: "roas", name: "ROAS", color: "#a78bfa" },
            ]}
            fmt="ratio"
          />
        </Card>
      </div>

      <SectionTitle>Funnel</SectionTitle>
      <Card subtitle={`Meta reported events, ${range.label.toLowerCase()}, deltas ${range.compareLabel}.`}>
        <Funnel stages={funnel} />
      </Card>

      <SectionTitle hint="Where the money goes by creative format, and what each format returns.">
        Creative mix
      </SectionTitle>
      <Card>
        <ShareBar
          items={creatives.map((c) => ({
            label: c.type,
            value: c.spend,
            color: CREATIVE_COLORS[c.type] ?? "#64748b",
          }))}
        />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-4 font-medium">Format</th>
                <th className="pb-2 pr-4 text-right font-medium">Spend</th>
                <th className="pb-2 pr-4 text-right font-medium">Share</th>
                <th className="pb-2 pr-4 text-right font-medium">CTR</th>
                <th className="pb-2 pr-4 text-right font-medium">Purchases</th>
                <th className="pb-2 text-right font-medium">ROAS (diag)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {creatives.map((c) => (
                <tr key={c.type} className="text-slate-300">
                  <td className="py-2.5 pr-4 font-medium text-slate-200">{c.type}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtUsd(c.spend)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtPct(c.share)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtPct(c.ctr)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtNum(c.purchases)}</td>
                  <td className="py-2.5 text-right tabular-nums">{fmtRatio(c.roas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <SectionTitle hint={`GA4 crosswalk match rate for Meta campaigns: ${fmtPct(matchRate)} of spend.`}>
        Campaigns
      </SectionTitle>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-4 font-medium">Campaign</th>
                <th className="pb-2 pr-4 font-medium">Health</th>
                <th className="pb-2 pr-4 text-right font-medium">Spend</th>
                <th className="pb-2 pr-4 text-right font-medium">CTR</th>
                <th className="pb-2 pr-4 text-right font-medium">ROAS (diag)</th>
                <th className="pb-2 text-right font-medium">GA4 sessions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {campaigns.map((c) => (
                <tr key={c.name} className="text-slate-300">
                  <td className="py-2.5 pr-4 font-medium text-slate-200">{c.name}</td>
                  <td className="py-2.5 pr-4">
                    <HealthChip health={c.health} />
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtUsd(c.spend)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">
                    {c.impressions > 0 ? fmtPct(c.clicks / c.impressions) : "n/a"}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtRatio(c.platformRoas)}</td>
                  <td className="py-2.5 text-right tabular-nums">
                    {c.ga4Sessions !== null ? fmtNumCompact(c.ga4Sessions) : <Badge tone="warn">no UTM match</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <SectionTitle hint="Frequency 6.0 or higher is highlighted: retargeting fatigue territory.">Ads</SectionTitle>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-4 font-medium">Ad</th>
                <th className="pb-2 pr-4 font-medium">Format</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 text-right font-medium">Spend</th>
                <th className="pb-2 pr-4 text-right font-medium">CTR</th>
                <th className="pb-2 pr-4 text-right font-medium">Freq.</th>
                <th className="pb-2 pr-4 text-right font-medium">Purchases</th>
                <th className="pb-2 pr-4 text-right font-medium">CPA</th>
                <th className="pb-2 text-right font-medium">ROAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {ads.map((ad) => {
                const ctr = ad.impressions > 0 ? ad.clicks / ad.impressions : 0;
                const cpa = ad.purchases > 0 ? ad.spend / ad.purchases : null;
                const roas = ad.spend > 0 ? ad.convValue / ad.spend : 0;
                const fatigued = ad.frequency >= 6;
                return (
                  <tr key={`${ad.campaign}-${ad.name}`} className="text-slate-300">
                    <td className="max-w-60 py-2.5 pr-4">
                      <p className="truncate font-medium text-slate-200">{ad.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {ad.campaign} | {ad.adset}
                      </p>
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-slate-400">{ad.type}</td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={ad.status === "ACTIVE" ? "good" : "neutral"}>{ad.status}</Badge>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{fmtUsd(ad.spend)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{fmtPct(ctr)}</td>
                    <td className={`py-2.5 pr-4 text-right tabular-nums ${fatigued ? "font-semibold text-amber-400" : ""}`}>
                      {ad.frequency.toFixed(1)}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{ad.purchases}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{cpa !== null ? fmtUsd(cpa) : "n/a"}</td>
                    <td className="py-2.5 text-right tabular-nums">{fmtRatio(roas)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
