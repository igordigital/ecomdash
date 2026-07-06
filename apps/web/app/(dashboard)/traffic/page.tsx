import { TrafficChart } from "@/components/charts";
import { RangeSelector } from "@/components/range-selector";
import { Badge, Card, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { fmtDuration, fmtNum, fmtNumCompact, fmtPct, fmtUsd, fmtUsdCompact } from "@/lib/format";
import { resolveRange, type RangeSearchParams } from "@/lib/range";
import {
  CHANNELS,
  getCampaignTraffic,
  getChannelSummaries,
  getContentTraffic,
  getEarliestDate,
  getLatestDate,
  getTrafficEcommerceSummary,
  getTrafficSeries,
} from "@/lib/mock";

export default async function TrafficPage({ searchParams }: { searchParams: Promise<RangeSearchParams> }) {
  const earliestDate = getEarliestDate();
  const latestDate = getLatestDate();
  const range = resolveRange(await searchParams, { earliest: earliestDate, latest: latestDate });
  const series = getTrafficSeries(range);
  const channels = getChannelSummaries(range);
  const campaigns = getCampaignTraffic(range);
  const content = getContentTraffic(range);
  const ecommerce = getTrafficEcommerceSummary(range);

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

      <SectionTitle>Channels</SectionTitle>
      <Card title="Daily sessions by channel" subtitle="Trailing context window around the selected range, stacked.">
        <TrafficChart data={series} channels={CHANNELS} />
      </Card>

      <div className="mt-4">
        <Card subtitle={`${range.label}, per channel. No crosswalk needed.`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-4 font-medium">Channel</th>
                  <th className="pb-2 pr-4 text-right font-medium">Sessions</th>
                  <th className="pb-2 pr-4 text-right font-medium">Engagement rate</th>
                  <th className="pb-2 pr-4 text-right font-medium">Avg session</th>
                  <th className="pb-2 pr-4 text-right font-medium">Bounce rate</th>
                  <th className="pb-2 text-right font-medium">New users</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {channels.map((ch) => (
                  <tr key={ch.channel} className="text-slate-300">
                    <td className="py-2.5 pr-4 font-medium text-slate-200">{ch.channel}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{fmtNum(ch.sessions)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{fmtPct(ch.engagementRate)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{fmtDuration(ch.avgSessionDuration)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{fmtPct(ch.bounceRate)}</td>
                    <td className="py-2.5 text-right tabular-nums">{fmtPct(ch.newUserShare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <SectionTitle hint="Google links to GA4 natively via GCLID. Meta depends on UTM tagging: a poorly tagged campaign shows no UTM match here, same as on the Campaigns page.">
        Campaigns
      </SectionTitle>
      <Card subtitle={`${range.label}. Ecommerce columns are GA4's own attribution: diagnostic only.`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-4 font-medium">Campaign</th>
                <th className="pb-2 pr-4 font-medium">Channel group</th>
                <th className="pb-2 pr-4 text-right font-medium">Sessions</th>
                <th className="pb-2 pr-4 text-right font-medium">Engagement rate</th>
                <th className="pb-2 pr-4 text-right font-medium">Transactions (diag)</th>
                <th className="pb-2 pr-4 text-right font-medium">Revenue (diag)</th>
                <th className="pb-2 text-right font-medium">AOV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {campaigns.map((c) => (
                <tr key={`${c.platform}-${c.campaign}`} className="text-slate-300">
                  <td className="py-2.5 pr-4 font-medium text-slate-200">{c.campaign}</td>
                  <td className="py-2.5 pr-4 text-xs text-slate-400">{c.channelGroup}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">
                    {c.sessions !== null ? fmtNumCompact(c.sessions) : <Badge tone="warn">no UTM match</Badge>}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">
                    {c.engagementRate !== null ? fmtPct(c.engagementRate) : <span className="text-slate-600">n/a</span>}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{c.utmMatched ? fmtNum(c.transactions) : "n/a"}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{c.utmMatched ? fmtUsd(c.revenue) : "n/a"}</td>
                  <td className="py-2.5 text-right tabular-nums">{c.utmMatched && c.transactions > 0 ? fmtUsd(c.aov) : "n/a"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <SectionTitle hint="utm_content (ad / creative). Meta only in this account: Google's ads do not carry manual content tags.">
        Ads (content)
      </SectionTitle>
      <Card subtitle={`${range.label}. Ecommerce columns are GA4's own attribution: diagnostic only.`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-4 font-medium">Ad (content)</th>
                <th className="pb-2 pr-4 font-medium">Campaign</th>
                <th className="pb-2 pr-4 text-right font-medium">Sessions</th>
                <th className="pb-2 pr-4 text-right font-medium">Engagement rate</th>
                <th className="pb-2 pr-4 text-right font-medium">Transactions (diag)</th>
                <th className="pb-2 pr-4 text-right font-medium">Revenue (diag)</th>
                <th className="pb-2 text-right font-medium">AOV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {content.map((c) => (
                <tr key={`${c.campaign}-${c.content}`} className="text-slate-300">
                  <td className="max-w-64 truncate py-2.5 pr-4 font-medium text-slate-200">{c.content}</td>
                  <td className="max-w-48 truncate py-2.5 pr-4 text-xs text-slate-400">{c.campaign}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtNumCompact(c.sessions)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtPct(c.engagementRate)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtNum(c.transactions)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtUsd(c.revenue)}</td>
                  <td className="py-2.5 text-right tabular-nums">{c.transactions > 0 ? fmtUsd(c.aov) : "n/a"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Ads under a campaign with no UTM match are excluded here too: content tags are a sub-dimension of the
          campaign tag, so if the campaign-level join fails, content can&apos;t resolve either.
        </p>
      </Card>
    </>
  );
}
