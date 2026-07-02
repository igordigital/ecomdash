import { MetricTrend } from "../../components/charts";
import { Card, Delta, PageHeader, SectionTitle, StatCard, StockChip } from "../../components/ui";
import { fmtNum, fmtPct, fmtUsd, fmtUsdCompact } from "../../lib/format";
import { getOverviewKpis, getStoreKpis, getTopProducts } from "../../lib/mock";

export default function StorePage() {
  const { cur, prev, daily } = getStoreKpis();
  const kpis = getOverviewKpis();
  const products = getTopProducts();

  return (
    <>
      <PageHeader
        title="Store"
        description="The source of truth. Net revenue here is the MER numerator: gross minus refunds and cancellations, reconciled daily over a trailing 30 day window."
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <StatCard
          label="Net revenue 28d"
          value={fmtUsdCompact(cur.revenue)}
          current={cur.revenue}
          previous={prev.revenue}
          spark={kpis.sparkRevenue}
          sparkColor="#f59e0b"
        />
        <StatCard
          label="Orders 28d"
          value={fmtNum(cur.orders)}
          current={cur.orders}
          previous={prev.orders}
          spark={kpis.sparkOrders}
          sparkColor="#34d399"
        />
        <StatCard label="AOV" value={fmtUsd(cur.aov)} current={cur.aov} previous={prev.aov} />
        <StatCard
          label="Refund rate"
          value={fmtPct(cur.refundRate)}
          current={cur.refundRate}
          previous={prev.refundRate}
          invert
        />
        <StatCard
          label="Discount rate"
          value={fmtPct(cur.discountRate)}
          current={cur.discountRate}
          previous={prev.discountRate}
          invert
        />
        <StatCard
          label="New customer orders"
          value={fmtPct(cur.newShare)}
          current={cur.newShare}
          previous={prev.newShare}
        />
      </div>

      <SectionTitle>Trends</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Net revenue, daily">
          <MetricTrend data={daily} series={[{ key: "revenue", name: "Net revenue", color: "#f59e0b" }]} fmt="usd" />
        </Card>
        <Card title="Orders and AOV, daily">
          <MetricTrend
            data={daily}
            series={[
              { key: "orders", name: "Orders", color: "#34d399" },
              { key: "aov", name: "AOV", color: "#a78bfa" },
            ]}
            fmt="num"
          />
        </Card>
      </div>

      <SectionTitle hint="Top sellers over the last 28 days with availability. Out of stock on a top seller is lost revenue that no ad metric will explain.">
        Top products
      </SectionTitle>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-4 font-medium">Product</th>
                <th className="pb-2 pr-4 font-medium">SKU</th>
                <th className="pb-2 pr-4 text-right font-medium">Units</th>
                <th className="pb-2 pr-4 text-right font-medium">Revenue</th>
                <th className="pb-2 pr-4 text-right font-medium">vs prior 28d</th>
                <th className="pb-2 font-medium">Availability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {products.map((p) => (
                <tr key={p.sku} className="text-slate-300">
                  <td className="py-2.5 pr-4 font-medium text-slate-200">{p.name}</td>
                  <td className="py-2.5 pr-4 text-xs text-slate-500">{p.sku}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtNum(p.units)}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{fmtUsd(p.revenue)}</td>
                  <td className="py-2.5 pr-4 text-right">
                    <Delta current={1 + p.deltaPct} previous={1} />
                  </td>
                  <td className="py-2.5">
                    <StockChip stock={p.stock} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Alpine Sleeping Bag is out of stock while down 31%: restock before spending against it. For WooCommerce
          clients, which order statuses count toward revenue is a per-client setting.
        </p>
      </Card>
    </>
  );
}
