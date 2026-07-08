import { RangeSelector } from "@/components/range-selector";
import { Badge, Card, HealthChip, PageHeader, PlatformDot } from "@/components/ui";
import { fmtNumCompact, fmtPct, fmtRatio, makeCurrencyFormatters } from "@/lib/format";
import { resolveRange, type RangeSearchParams } from "@/lib/range";
import { resolveViewedClientId } from "@/lib/viewed-client";
import { getCampaignHealth, getClientCurrency, getClientTimezone, getEarliestDate, getLatestDate, getUtmMatchRate } from "@/lib/dashboard-data";

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<RangeSearchParams> }) {
  const sp = await searchParams;
  const clientId = await resolveViewedClientId(sp.clientId);
  const timezone = await getClientTimezone(clientId);
  const earliestDate = getEarliestDate(timezone);
  const latestDate = getLatestDate(timezone);
  const range = resolveRange(sp, { earliest: earliestDate, latest: latestDate });
  const [campaigns, matchRate, currency] = await Promise.all([
    getCampaignHealth(clientId, range),
    getUtmMatchRate(clientId, range),
    getClientCurrency(clientId),
  ]);
  const { fmtUsd } = makeCurrencyFormatters(currency);

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Every campaign across networks in one table, sorted by spend. Platform ROAS is diagnostic only: each platform claims conversions under its own attribution, so it is never summed across platforms."
        right={
          <div className="flex items-center gap-2">
            <Badge tone={matchRate > 0.9 ? "good" : "warn"}>UTM match rate {fmtPct(matchRate)}</Badge>
            <RangeSelector current={range} pathname="/campaigns" earliestDate={earliestDate} latestDate={latestDate} />
          </div>
        }
      />

      <Card subtitle={`${range.label}. GA4 columns join via the campaign crosswalk where UTM tagging allows.`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-4 font-medium">Campaign</th>
                <th className="pb-2 pr-4 font-medium">Platform</th>
                <th className="pb-2 pr-4 font-medium">Health</th>
                <th className="pb-2 pr-4 text-right font-medium">Spend</th>
                <th className="pb-2 pr-4 text-right font-medium">Impressions</th>
                <th className="pb-2 pr-4 text-right font-medium">Clicks</th>
                <th className="pb-2 pr-4 text-right font-medium">ROAS (diag)</th>
                <th className="pb-2 pr-4 text-right font-medium">GA4 sessions</th>
                <th className="pb-2 text-right font-medium">GA4 engagement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {campaigns.map((c) => (
                <tr key={`${c.platform}-${c.campaignId}`} className="text-slate-300">
                  <td className="py-2.5 pr-4 font-medium text-slate-200">{c.name}</td>
                  <td className="py-2.5 pr-4">
                    <PlatformDot platform={c.platform} />
                  </td>
                  <td className="py-2.5 pr-4">
                    <HealthChip health={c.health} />
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtUsd(c.spend)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtNumCompact(c.impressions)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtNumCompact(c.clicks)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtRatio(c.platformRoas)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">
                    {c.ga4Sessions !== null ? fmtNumCompact(c.ga4Sessions) : <Badge tone="warn">no UTM match</Badge>}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">
                    {c.ga4EngagementRate !== null ? fmtPct(c.ga4EngagementRate) : <span className="text-slate-600">n/a</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Campaigns without a UTM match still count fully toward blended MER. Only their GA4 validation is degraded.
        </p>
      </Card>
    </>
  );
}
