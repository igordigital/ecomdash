import Link from "next/link";
import { MetricTrend, SpendRevenueChart } from "@/components/charts";
import { RangeSelector } from "@/components/range-selector";
import {
  Badge,
  Card,
  Funnel,
  MultiWindowStat,
  PageHeader,
  SectionTitle,
  ShareBar,
  StatCard,
} from "@/components/ui";
import { fmtNum, fmtPct, fmtRatio, fmtUsd, fmtUsdCompact } from "@/lib/format";
import { rangeQueryString, resolveRange, withPreviewParams, type RangeSearchParams } from "@/lib/range";
import { resolveViewedClientId } from "@/lib/viewed-client";
import {
  MER_TARGET,
  getAnomalies,
  getEarliestDate,
  getLatestDate,
  getMerSeries,
  getNetworkKpis,
  getOverviewKpis,
  getRollingWindows,
  getSiteFunnel,
  getStoreKpis,
} from "@/lib/mock";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<RangeSearchParams>;
}) {
  const sp = await searchParams;
  const earliestDate = getEarliestDate();
  const latestDate = getLatestDate();
  const range = resolveRange(sp, { earliest: earliestDate, latest: latestDate });
  const clientId = await resolveViewedClientId(sp.clientId);

  const rolling = getRollingWindows(clientId);
  const kpis = getOverviewKpis(clientId, range);
  const store = getStoreKpis(clientId, range);
  const series = getMerSeries(clientId, range);
  const meta = getNetworkKpis(clientId, "meta", range);
  const google = getNetworkKpis(clientId, "google", range);
  const funnel = getSiteFunnel(clientId, range);
  const topAnomalies = getAnomalies(clientId, range).slice(0, 3);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Blended efficiency anchored to store truth. MER credits all revenue, including organic, email, and direct, to paid spend. That is intentional."
        right={<RangeSelector current={range} pathname="/" earliestDate={earliestDate} latestDate={latestDate} />}
      />

      <SectionTitle hint="Always anchored to the latest complete day. Independent of the range selector above.">
        Rolling KPIs
      </SectionTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MultiWindowStat label="MER" points={rolling.mer} spark={rolling.merSpark} format={fmtRatio} sparkColor="#a78bfa" />
        <MultiWindowStat label="Ad spend" points={rolling.spend} spark={rolling.spendSpark} format={fmtUsdCompact} sparkColor="#38bdf8" />
        <MultiWindowStat
          label="Store net revenue"
          points={rolling.revenue}
          spark={rolling.revenueSpark}
          format={fmtUsdCompact}
          sparkColor="#f59e0b"
        />
        <MultiWindowStat label="Orders" points={rolling.orders} spark={rolling.ordersSpark} format={fmtNum} sparkColor="#34d399" />
      </div>

      <SectionTitle hint={`${range.label}, ${range.compareLabel}. Set by the range selector above.`}>
        Efficiency and store
      </SectionTitle>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="MER"
          value={fmtRatio(kpis.mer)}
          current={kpis.mer}
          previous={kpis.merPrev}
          hint={`target ${MER_TARGET.toFixed(1)}`}
          accent={kpis.mer >= MER_TARGET}
        />
        <StatCard label="Ad spend" value={fmtUsdCompact(kpis.spend)} current={kpis.spend} previous={kpis.spendPrev} />
        <StatCard
          label="Store net revenue"
          value={fmtUsdCompact(kpis.revenue)}
          current={kpis.revenue}
          previous={kpis.revenuePrev}
        />
        <StatCard label="Orders" value={fmtNum(kpis.orders)} current={kpis.orders} previous={kpis.ordersPrev} />
        <StatCard label="AOV" value={fmtUsd(store.cur.aov)} current={store.cur.aov} previous={store.prev.aov} />
        <StatCard
          label="New customer orders"
          value={fmtPct(store.cur.newShare)}
          current={store.cur.newShare}
          previous={store.prev.newShare}
        />
        <StatCard
          label="Refund rate"
          value={fmtPct(store.cur.refundRate)}
          current={store.cur.refundRate}
          previous={store.prev.refundRate}
          invert
        />
        <StatCard
          label="Discount rate"
          value={fmtPct(store.cur.discountRate)}
          current={store.cur.discountRate}
          previous={store.prev.discountRate}
          invert
        />
      </div>

      <SectionTitle>Trends</SectionTitle>
      <div className="grid gap-4">
        <Card
          title="Daily spend vs store net revenue"
          subtitle="Spend from Meta and Google. Revenue only from the store, never from platform conversions."
        >
          <SpendRevenueChart data={series} />
        </Card>
        <Card title={`Rolling MER (${range.label.toLowerCase()} window) vs target`} subtitle="Restated as platforms revise attribution.">
          <MetricTrend
            data={series}
            series={[{ key: "mer", name: "MER", color: "#a78bfa" }]}
            fmt="ratio"
            target={MER_TARGET}
            targetLabel={`target ${MER_TARGET.toFixed(1)}`}
          />
        </Card>
      </div>

      <SectionTitle hint="Platform conversions and ROAS are each network's own attribution: diagnostic, never summed.">
        Networks
      </SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Spend split">
          <ShareBar
            items={[
              { label: "Meta", value: meta.cur.spend, color: "#38bdf8" },
              { label: "Google", value: google.cur.spend, color: "#34d399" },
            ]}
          />
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {[
              { name: "Meta", href: "/meta", k: meta },
              { name: "Google", href: "/google", k: google },
            ].map(({ name, href, k }) => (
              <div key={name} className="rounded border border-slate-800 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-200">{name}</p>
                  <Link href={`${href}?${withPreviewParams(rangeQueryString(range), sp)}`} className="text-xs text-sky-400 hover:underline">
                    Deep dive
                  </Link>
                </div>
                <dl className="mt-2 grid gap-1 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <dt>Spend</dt>
                    <dd className="tabular-nums text-slate-300">{fmtUsdCompact(k.cur.spend)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>
                      ROAS <Badge tone="warn">diag</Badge>
                    </dt>
                    <dd className="tabular-nums text-slate-300">{fmtRatio(k.cur.roas)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>CPA</dt>
                    <dd className="tabular-nums text-slate-300">{k.cur.cpa !== null ? fmtUsd(k.cur.cpa) : "n/a"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>CTR</dt>
                    <dd className="tabular-nums text-slate-300">{fmtPct(k.cur.ctr)}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Site funnel" subtitle="Full view on the Funnel page.">
          <Funnel stages={funnel} />
        </Card>
      </div>

      <SectionTitle>Flags</SectionTitle>
      <Card subtitle="Ranked by absolute spend or revenue impact, within the selected range.">
        {topAnomalies.length > 0 ? (
          <>
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
            <Link
              href={`/anomalies?${withPreviewParams(rangeQueryString(range), sp)}`}
              className="mt-3 inline-block text-xs text-sky-400 hover:underline"
            >
              All flags
            </Link>
          </>
        ) : (
          <p className="text-sm text-slate-500">No flags in the selected range.</p>
        )}
      </Card>
    </>
  );
}
