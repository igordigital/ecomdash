import Link from "next/link";
import { MerChart, SpendRevenueChart } from "../components/charts";
import { Badge, Card, Funnel, PageHeader, SectionTitle, ShareBar, StatCard } from "../components/ui";
import { fmtPct, fmtRatio, fmtUsd, fmtUsdCompact, fmtNum } from "../lib/format";
import {
  MER_TARGET,
  getAnomalies,
  getMerSeries,
  getNetworkKpis,
  getOverviewKpis,
  getSiteFunnel,
  getStoreKpis,
} from "../lib/mock";

export default function OverviewPage() {
  const kpis = getOverviewKpis();
  const store = getStoreKpis();
  const series = getMerSeries();
  const meta = getNetworkKpis("meta");
  const google = getNetworkKpis("google");
  const funnel = getSiteFunnel();
  const topAnomalies = getAnomalies().slice(0, 3);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Blended efficiency anchored to store truth, last 28 days vs the prior 28. MER credits all revenue, including organic, email, and direct, to paid spend. That is intentional."
      />

      <SectionTitle hint="MER = store net revenue / total ad spend across platforms.">
        Efficiency
      </SectionTitle>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="MER 7d"
          value={fmtRatio(kpis.mer7)}
          current={kpis.mer7}
          previous={kpis.mer7Prev}
          spark={kpis.sparkMer7}
          sparkColor="#a78bfa"
          hint={`target ${MER_TARGET.toFixed(1)}`}
          accent={kpis.mer7 >= MER_TARGET}
        />
        <StatCard
          label="MER 28d"
          value={fmtRatio(kpis.mer28)}
          current={kpis.mer28}
          previous={kpis.mer28Prev}
          hint={`target ${MER_TARGET.toFixed(1)}`}
          accent={kpis.mer28 >= MER_TARGET}
        />
        <StatCard
          label="Ad spend 28d"
          value={fmtUsdCompact(kpis.spend28)}
          current={kpis.spend28}
          previous={kpis.spend28Prev}
          spark={kpis.sparkSpend}
          hint="vs prior 28d"
        />
        <StatCard
          label="Store net revenue 28d"
          value={fmtUsdCompact(kpis.revenue28)}
          current={kpis.revenue28}
          previous={kpis.revenue28Prev}
          spark={kpis.sparkRevenue}
          sparkColor="#f59e0b"
          hint="vs prior 28d"
        />
      </div>

      <SectionTitle hint="Store truth from Shopify orders, last 28 days.">Store</SectionTitle>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Orders"
          value={fmtNum(store.cur.orders)}
          current={store.cur.orders}
          previous={store.prev.orders}
          spark={kpis.sparkOrders}
          sparkColor="#34d399"
        />
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
      </div>

      <SectionTitle>Trends</SectionTitle>
      <div className="grid gap-4">
        <Card
          title="Daily spend vs store net revenue"
          subtitle="Spend from Meta and Google. Revenue only from the store, never from platform conversions."
        >
          <SpendRevenueChart data={series} />
        </Card>
        <Card title="Rolling MER vs target" subtitle="7 and 28 day windows, restated as platforms revise attribution.">
          <MerChart data={series} target={MER_TARGET} />
        </Card>
      </div>

      <SectionTitle hint="Platform conversions and ROAS are each network's own attribution: diagnostic, never summed.">
        Networks
      </SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Spend split, 28d">
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
                  <Link href={href} className="text-xs text-sky-400 hover:underline">
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

        <Card title="Site funnel, 28d" subtitle="Sessions to orders, all traffic. Full view on the Funnel page.">
          <Funnel stages={funnel} />
        </Card>
      </div>

      <SectionTitle>Flags</SectionTitle>
      <Card subtitle="Ranked by absolute spend or revenue impact.">
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
    </>
  );
}
