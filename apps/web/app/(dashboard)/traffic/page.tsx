import { TrafficChart } from "@/components/charts";
import { RangeSelector } from "@/components/range-selector";
import { Card, PageHeader } from "@/components/ui";
import { fmtDuration, fmtNum, fmtPct } from "@/lib/format";
import { resolveRange, type RangeSearchParams } from "@/lib/range";
import { CHANNELS, getChannelSummaries, getEarliestDate, getLatestDate, getTrafficSeries } from "@/lib/mock";

export default async function TrafficPage({ searchParams }: { searchParams: Promise<RangeSearchParams> }) {
  const earliestDate = getEarliestDate();
  const latestDate = getLatestDate();
  const range = resolveRange(await searchParams, { earliest: earliestDate, latest: latestDate });
  const series = getTrafficSeries(range);
  const channels = getChannelSummaries(range);

  return (
    <>
      <PageHeader
        title="Site traffic"
        description="Session and engagement health from GA4, by default channel grouping. No crosswalk involved: this is what the site is actually doing, regardless of attribution."
        right={<RangeSelector current={range} pathname="/traffic" earliestDate={earliestDate} latestDate={latestDate} />}
      />

      <Card title="Daily sessions by channel" subtitle="Trailing context window around the selected range, stacked.">
        <TrafficChart data={series} channels={CHANNELS} />
      </Card>

      <div className="mt-4">
        <Card subtitle={`${range.label}, per channel.`}>
          <table className="w-full text-sm">
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
        </Card>
      </div>
    </>
  );
}
