import { Badge, Card, PageHeader } from "../../components/ui";
import { fmtNumCompact, fmtPct, fmtRatio, fmtUsd } from "../../lib/format";
import { getMetaAds } from "../../lib/mock";

export default function AdsPage() {
  const ads = getMetaAds();

  return (
    <>
      <PageHeader
        title="Meta ads"
        description="Ad level drill-down, platform reported data only. CPA and ROAS here use Meta's own attribution (7d click, 1d view) and will not match store revenue."
        right={<Badge tone="warn">platform reported</Badge>}
      />

      <Card subtitle="Last 28 days, sorted by spend.">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="pb-2 pr-4 font-medium">Ad</th>
              <th className="pb-2 pr-4 font-medium">Campaign / ad set</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 pr-4 text-right font-medium">Spend</th>
              <th className="pb-2 pr-4 text-right font-medium">Impr.</th>
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
                  <td className="max-w-56 truncate py-2.5 pr-4 font-medium text-slate-200">{ad.name}</td>
                  <td className="max-w-52 py-2.5 pr-4 text-xs text-slate-400">
                    {ad.campaign}
                    <br />
                    {ad.adset}
                  </td>
                  <td className="py-2.5 pr-4">
                    <Badge tone={ad.status === "ACTIVE" ? "good" : "neutral"}>{ad.status}</Badge>
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtUsd(ad.spend)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtNumCompact(ad.impressions)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtPct(ctr)}</td>
                  <td className={`py-2.5 pr-4 text-right tabular-nums ${fatigued ? "text-amber-400" : ""}`}>
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
        <p className="mt-4 text-xs text-slate-500">
          Frequency 6.0 or higher is highlighted: retargeting fatigue territory.
        </p>
      </Card>
    </>
  );
}
