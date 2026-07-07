const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const numCompact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Fallback USD formatters for contexts with no client (e.g. admin pages). Dashboard pages should use makeCurrencyFormatters(client.currency) instead. */
export const fmtUsd = (n: number) => usd.format(n);
export const fmtUsdCompact = (n: number) => usdCompact.format(n);

/** Currency-aware formatters bound to a specific client's currency setting (dim_client.currency). */
export function makeCurrencyFormatters(currency: string) {
  const full = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 });
  const compact = new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 });
  return {
    fmtUsd: (n: number) => full.format(n),
    fmtUsdCompact: (n: number) => compact.format(n),
  };
}

export const fmtNum = (n: number) => num.format(n);
export const fmtNumCompact = (n: number) => numCompact.format(n);
export const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
export const fmtRatio = (n: number) => n.toFixed(2);

export function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function fmtDelta(current: number, previous: number): string {
  if (previous === 0) return "";
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}% vs prior 28d`;
}
