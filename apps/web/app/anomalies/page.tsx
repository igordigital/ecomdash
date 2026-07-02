import { RangeSelector } from "../../components/range-selector";
import { Badge, Card, PageHeader } from "../../components/ui";
import { fmtUsd } from "../../lib/format";
import { resolveRange, type RangeSearchParams } from "../../lib/range";
import { getAnomalies, getEarliestDate, getLatestDate } from "../../lib/mock";

const KIND_LABEL: Record<string, string> = {
  spend_swing: "Spend swing",
  mer_move: "MER movement",
  conv_rate_drop: "Conversion rate drop",
};

export default async function AnomaliesPage({ searchParams }: { searchParams: Promise<RangeSearchParams> }) {
  const earliestDate = getEarliestDate();
  const latestDate = getLatestDate();
  const range = resolveRange(await searchParams, { earliest: earliestDate, latest: latestDate });
  const anomalies = getAnomalies(range);

  return (
    <>
      <PageHeader
        title="Anomalies"
        description="Daily flags on spend swings, MER movement, and conversion rate drops, ranked by absolute spend or revenue impact. Each note explains what moved and the likely cause."
        right={<RangeSelector current={range} pathname="/anomalies" earliestDate={earliestDate} latestDate={latestDate} />}
      />

      {anomalies.length > 0 ? (
        <div className="grid gap-4">
          {anomalies.map((a) => (
            <Card key={`${a.date}-${a.scope}`}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Badge tone={a.kind === "mer_move" ? "bad" : a.kind === "conv_rate_drop" ? "warn" : "info"}>
                    {KIND_LABEL[a.kind] ?? a.kind}
                  </Badge>
                  <p className="text-sm font-medium text-slate-200">{a.scope}</p>
                  <p className="text-xs text-slate-500">{a.date}</p>
                </div>
                <p className="text-sm font-semibold tabular-nums text-slate-200">
                  {fmtUsd(a.impactAbs)} <span className="text-xs font-normal text-slate-500">impact</span>
                </p>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{a.narrative}</p>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">No flags in {range.label.toLowerCase()}.</p>
        </Card>
      )}

      <p className="mt-4 text-xs text-slate-500">
        In production these notes are generated daily by Claude from the settled facts, then stored. Nothing is
        written at page load.
      </p>
    </>
  );
}
