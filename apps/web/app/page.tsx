import Link from "next/link";
import { MerChart, SpendRevenueChart } from "../components/charts";
import { Badge, Card, Kpi, PageHeader } from "../components/ui";
import { fmtDelta, fmtRatio, fmtUsdCompact } from "../lib/format";
import { getAnomalies, getMerSeries, getOverviewKpis } from "../lib/mock";

export default function OverviewPage() {
  const kpis = getOverviewKpis();
  const series = getMerSeries();
  const topAnomalies = getAnomalies().slice(0, 3);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Blended efficiency anchored to store truth. MER credits all revenue, including organic, email, and direct, to paid spend. That is intentional."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="MER 7d" value={fmtRatio(kpis.mer7)} hint="store net revenue / total ad spend" accent />
        <Kpi label="MER 28d" value={fmtRatio(kpis.mer28)} hint="store net revenue / total ad spend" />
        <Kpi label="Ad spend 28d" value={fmtUsdCompact(kpis.spend28)} hint={fmtDelta(kpis.spend28, kpis.spend28Prev)} />
        <Kpi
          label="Store net revenue 28d"
          value={fmtUsdCompact(kpis.revenue28)}
          hint={fmtDelta(kpis.revenue28, kpis.revenue28Prev)}
        />
      </div>

      <div className="mt-4 grid gap-4">
        <Card
          title="Daily spend vs store net revenue"
          subtitle="Spend from Meta and Google. Revenue only from the store, never from platform conversions."
        >
          <SpendRevenueChart data={series} />
        </Card>

        <Card title="Rolling MER" subtitle="7 day and 28 day windows, restated as platforms revise attribution.">
          <MerChart data={series} />
        </Card>

        <Card title="Latest flags" subtitle="Ranked by absolute spend or revenue impact.">
          <ul className="divide-y divide-slate-800">
            {topAnomalies.map((a) => (
              <li key={`${a.date}-${a.scope}`} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <Badge tone={a.kind === "mer_move" ? "bad" : a.kind === "conv_rate_drop" ? "warn" : "info"}>
                  {a.kind.replace(/_/g, " ")}
                </Badge>
                <div className="min-w-0">
                  <p className="text-sm text-slate-200">
                    {a.scope} <span className="text-slate-500">| {a.date}</span>
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{a.narrative}</p>
                </div>
              </li>
            ))}
          </ul>
          <Link href="/anomalies" className="mt-3 inline-block text-xs text-sky-400 hover:underline">
            All flags
          </Link>
        </Card>
      </div>
    </>
  );
}
