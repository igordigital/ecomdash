/**
 * Date range resolution for the dashboard's range selector. Presets are
 * anchored to the latest complete day (yesterday, since data lands once
 * daily via the restatement job); custom ranges are user picked and clamped
 * to available data. Pure date math, no dependency on the data layer.
 */

export type RangeKey = "1d" | "7d" | "30d" | "custom";

export interface RangeSearchParams {
  range?: string;
  from?: string;
  to?: string;
}

export interface ResolvedRange {
  key: RangeKey;
  days: number;
  start: string;
  end: string;
  label: string;
  compareLabel: string;
}

export function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtShort(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const PRESETS: Record<"1d" | "7d" | "30d", { days: number; label: string; compareLabel: string }> = {
  "1d": { days: 1, label: "Yesterday", compareLabel: "vs day before" },
  "7d": { days: 7, label: "Last 7 days", compareLabel: "vs prior 7 days" },
  "30d": { days: 30, label: "Last 30 days", compareLabel: "vs prior 30 days" },
};

export function resolveRange(
  params: RangeSearchParams,
  bounds: { earliest: string; latest: string },
): ResolvedRange {
  if (params.range === "custom" && params.from && params.to && params.from <= params.to) {
    const start = params.from < bounds.earliest ? bounds.earliest : params.from;
    const end = params.to > bounds.latest ? bounds.latest : params.to;
    const days =
      Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
    return {
      key: "custom",
      days: Math.max(days, 1),
      start,
      end,
      label: start === end ? fmtShort(start) : `${fmtShort(start)} - ${fmtShort(end)}`,
      compareLabel: "vs prior period",
    };
  }
  const key = params.range === "1d" || params.range === "30d" ? params.range : "7d";
  const preset = PRESETS[key];
  const end = bounds.latest;
  const start = addDays(end, -(preset.days - 1));
  return { key, days: preset.days, start, end, label: preset.label, compareLabel: preset.compareLabel };
}

/** Same-length period immediately before the given range, for delta comparisons. */
export function previousRange(range: ResolvedRange): { start: string; end: string } {
  const end = addDays(range.start, -1);
  const start = addDays(end, -(range.days - 1));
  return { start, end };
}

/** Trailing chart window: at least 30 days of context, capped at 90, ending with the range. */
export function chartRange(range: ResolvedRange): { start: string; end: string } {
  const days = Math.min(90, Math.max(30, range.days));
  return { start: addDays(range.end, -(days - 1)), end: range.end };
}

export function rangeQueryString(range: ResolvedRange): string {
  return range.key === "custom" ? `range=custom&from=${range.start}&to=${range.end}` : `range=${range.key}`;
}
