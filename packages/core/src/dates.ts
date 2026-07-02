import type { DateRange } from "./connector.js";

export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateKey(d);
}

/** Trailing window ending at `end` (inclusive), `days` long. */
export function trailingRange(end: string, days: number): DateRange {
  return { start: addDays(end, -(days - 1)), end };
}

/** Expand a range into single days, oldest first. Backfill pulls one day per request. */
export function* eachDay(range: DateRange): Generator<string> {
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) {
    yield d;
  }
}
