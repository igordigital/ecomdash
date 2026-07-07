import { TrafficChart } from "@/components/charts";
import { RangeSelector } from "@/components/range-selector";
import { Badge, Card, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { fmtDuration, fmtNum, fmtNumCompact, fmtPct, makeCurrencyFormatters } from "@/lib/format";
import { resolveRange, type RangeSearchParams } from "@/lib/range";
import { resolveViewedClientId } from "@/lib/viewed-client";
import {
  getCampaignTraffic,
  getChannelSummaries,
  getClientCurrency,
  getContentTraffic,
  getEarliestDate,
  getLatestDate,
  getTrafficEcommerceSummary,
  getTrafficSeries,
} from "@/lib/dashboard-data";

export default async function TrafficPage({ searchParams }: { searchParams: Promise<RangeSearchParams> }) {
  const sp = await searchParams;
  const earliestDate = getEarliestDate();
  const latestDate = getLatestDate();
  const range = resolveRange(sp, { earliest: earliestDate, latest: latestDate });
  const clientId = await resolveViewedClientId(sp.clientId);

  // Channels first: the chart's series list is exactly the top-10 channel names from the table, so they always match.
  const [channels, campaigns, content, ecommerce, currency] = await Promise.all([
    getChannelSummaries(clientId, range),
    getCampaignTraffic(clientId, range),
    getContentTraffic(clientId, range),
    getTrafficEcommerceSummary(clientId, range),
    getClientCurrency(clientId),
  ]);
  const channelNames = channels.map((c) => c.channel);
  const series = await getTrafficSeries(clientId, range, channelNames);
  const { fmtUsd, fmtUsdCompact } = makeCurrencyFormatters(currency);

  return (
    <>
      <PageHeader
        title="Site traffic"
        description="Session and engagement health from GA4: by channel, by campaign, and by ad content. No crosswalk needed for the channel view; campaign and content rows depend on UTM tagging (Meta) or the native GCLID link (Google)."
        right={<RangeSelector current={range} pathname="/traffic" earliestDate={earliestDate} latestDate={latestDate} />}
      />

      <SectionTitle hint="GA4's own attributed transactions and revenue. Diagnostic only: the store, not GA4, is the revenue source of truth.">
        Ecommerce (GA4, diagnostic)
      </SectionTitle>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Sessions" value={fmtNumCompact(ecommerce.sessions)} />
        <StatCard label="Transactions" value={fmtNum(ecommerce.transactions)} />
        <StatCard label="Revenue" value={fmtUsdCompact(ecommerce.revenue)} />
        <StatCard label="Ecommerce conv. rate" value={fmtPct(ecommerce.ecommerceConversionRate)} hint={`AOV ${fmtUsd(ecommerce.aov)}`} />
      </div>

      <SectionTitle hint="Top 10 channels by sessions, GA4's own default channel grouping (includes Paid Shopping, Cross-network, etc. as reported).">
        Channels
      </SectionTitle>
      <Card title="Daily sessions by channel" subtitle={`${range.label}, stacked, top ${channelNames.length}.`}>
        <TrafficChart data={series} channels={channelNames} />
      </Card>

      <div className="mt-4">
        <Card subtitle={`${range.label}, per channel. No crosswalk needed.`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-4 font-medium">Channel</th>
                  <th className="pb-2 pr-4 text-right font-medium">Sessions</th>
                  <th className="pb-2 pr-4 text-right font-medium">Eng. rate</th>
                  <th className="pb-2 pr-4 text-right font-medium">Avg session</th>
                  <th className="pb-2 pr-4 text-right font-medium">New users</th>
                  <th className="pb-2 pr-4 text-right font-medium">Add to carts</th>
                  <th className="pb-2 text-right font-medium">Transactions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {channels.map((ch) => (
                  <tr key={ch.channel} className="text-slate-300">
                    <td className="py-2.5 pr-4 font-medium text-slate-200">{ch.channel}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{fmtNum(ch.sessions)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{fmtPct(ch.engagementRate)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{fmtDuration(ch.avgSessionDuration)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{fmtPct(ch.newUserShare)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{fmtNum(ch.addToCarts)}</td>
                    <td className="py-2.5 text-right tabular-nums">{fmtNum(ch.transactions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <SectionTitle hint="Every campaign GA4 has session data for, matched to a known ad campaign or not. Google links to GA4 natively via GCLID; Meta and other sources depend on UTM tagging.">
        Campaigns
      </SectionTitle>
      <Card subtitle={`${range.label}. Ecommerce columns are GA4's own attribution: diagnostic only.`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-4 font-medium">Campaign (utm_campaign)</th>
                <th className="pb-2 pr-4 font-medium">Top source / medium</th>
                <th className="pb-2 pr-4 font-medium">Matched ad campaign</th>
                <th className="pb-2 pr-4 text-right font-medium">Sessions</th>
                <th className="pb-2 pr-4 text-right font-medium">Engagement rate</th>
                <th className="pb-2 pr-4 text-right font-medium">Add to carts</th>
                <th className="pb-2 pr-4 text-right font-medium">Transactions (diag)</th>
                <th className="pb-2 pr-4 text-right font-medium">Revenue (diag)</th>
                <th className="pb-2 text-right font-medium">AOV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {campaigns.map((c) => (
                <tr key={c.campaign} className="text-slate-300">
                  <td className="max-w-56 truncate py-2.5 pr-4 font-medium text-slate-200">{c.campaign}</td>
                  <td className="max-w-40 truncate py-2.5 pr-4 text-xs text-slate-400">{c.sourceMedium}</td>
                  <td className="py-2.5 pr-4">
                    {c.matchedPlatform ? (
                      <span className="text-xs text-slate-300">
                        {c.matchedPlatform === "meta" ? "Meta" : "Google"} · {c.matchedCampaignName}
                      </span>
                    ) : (
                      <Badge tone="neutral">Not matched</Badge>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtNumCompact(c.sessions)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtPct(c.engagementRate)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtNum(c.addToCarts)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtNum(c.transactions)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtUsd(c.revenue)}</td>
                  <td className="py-2.5 text-right tabular-nums">{c.transactions > 0 ? fmtUsd(c.aov) : "n/a"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <SectionTitle hint="utm_content (ad / creative), GA4's sessionManualAdContent dimension.">Ads (content)</SectionTitle>
      <Card subtitle={`${range.label}. Ecommerce columns are GA4's own attribution: diagnostic only.`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-4 font-medium">Ad (content)</th>
                <th className="pb-2 pr-4 font-medium">Campaign</th>
                <th className="pb-2 pr-4 text-right font-medium">Sessions</th>
                <th className="pb-2 pr-4 text-right font-medium">Engagement rate</th>
                <th className="pb-2 pr-4 text-right font-medium">Add to carts</th>
                <th className="pb-2 pr-4 text-right font-medium">Transactions (diag)</th>
                <th className="pb-2 pr-4 text-right font-medium">Revenue (diag)</th>
                <th className="pb-2 text-right font-medium">AOV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {content.length > 0 ? (
                content.map((c) => (
                  <tr key={`${c.campaign}-${c.content}`} className="text-slate-300">
                    <td className="max-w-64 truncate py-2.5 pr-4 font-medium text-slate-200">{c.content}</td>
                    <td className="max-w-48 truncate py-2.5 pr-4 text-xs text-slate-400">{c.campaign}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{fmtNumCompact(c.sessions)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{fmtPct(c.engagementRate)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{fmtNum(c.addToCarts)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{fmtNum(c.transactions)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{fmtUsd(c.revenue)}</td>
                    <td className="py-2.5 text-right tabular-nums">{c.transactions > 0 ? fmtUsd(c.aov) : "n/a"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-sm text-slate-500">
                    No utm_content tagging in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Only sessions with a utm_content tag are shown; sessions without one don&apos;t resolve to a specific ad.
        </p>
      </Card>
    </>
  );
}
