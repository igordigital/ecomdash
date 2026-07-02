import type { CanonicalRecord } from "./types.js";

export interface DateRange {
  /** Inclusive, YYYY-MM-DD, client timezone. */
  start: string;
  /** Inclusive, YYYY-MM-DD, client timezone. */
  end: string;
}

export interface AuthContext {
  clientId: string;
  /** Opaque provider-specific auth state (tokens, API clients, property ids). */
  provider: Record<string, unknown>;
}

/** A raw provider record, untouched. Kept for fixtures and debugging. */
export interface RawRecord {
  source: SourceName;
  payload: unknown;
}

export type SourceName = "meta" | "google-ads" | "ga4" | "shopify" | "woo";

/**
 * Every source implements the same contract so the loader and restatement
 * logic are uniform. Connectors never write to the DB directly; loading is
 * centralized in @ecomdash/warehouse (upsert by grain).
 */
export interface Connector<TConfig> {
  readonly source: SourceName;
  /** Trailing re-pull window in days for the daily refresh (restatement). */
  readonly restatementDays: number;
  authenticate(cfg: TConfig): Promise<AuthContext>;
  /** Yields raw provider records for the range, paginated internally. */
  extract(ctx: AuthContext, range: DateRange): AsyncIterable<RawRecord>;
  /** Maps raw records into canonical fact_* shaped rows. */
  normalize(raw: RawRecord): CanonicalRecord[];
}
