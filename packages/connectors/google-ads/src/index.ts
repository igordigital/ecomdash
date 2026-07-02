import type {
  AuthContext,
  CanonicalRecord,
  Connector,
  DateRange,
  RawRecord,
} from "@ecomdash/core";

/**
 * Google Ads API connector. Campaign + ad_group grain at v1 (Decision D2);
 * ad_id stays "" so the fact_ad_daily PK holds.
 *
 * - OAuth2 refresh token under the agency MCC; login-customer-id = MCC id,
 *   each client queried via their customer_id.
 * - GAQL over campaign / ad_group, always with segments.date.
 * - Cost arrives in micros: metrics.cost_micros / 1e6.
 * - Pin the API version at build time; Google deprecates on a schedule.
 * - Restatement: trailing ~28 days (conversion lag + modeled/consent-mode).
 *
 * BLOCKED until the developer token (Basic access) is approved.
 */

export interface GoogleAdsConfig {
  clientId: string;
  customerId: string;
  developerToken: string;
  oauthClientId: string;
  oauthClientSecret: string;
  refreshToken: string;
  loginCustomerId: string; // MCC id
}

export const googleAdsConnector: Connector<GoogleAdsConfig> = {
  source: "google-ads",
  restatementDays: 28,

  async authenticate(cfg: GoogleAdsConfig): Promise<AuthContext> {
    return { clientId: cfg.clientId, provider: { ...cfg } };
  },

  // eslint-disable-next-line require-yield
  async *extract(_ctx: AuthContext, _range: DateRange): AsyncIterable<RawRecord> {
    // TODO(phase-2): GAQL query per day with segments.date.
    throw new Error("google-ads extract not implemented yet");
  },

  normalize(_raw: RawRecord): CanonicalRecord[] {
    // TODO(phase-2): map GAQL rows to fact_ad_daily (platform='google',
    // ad_id='', spend = cost_micros / 1e6).
    throw new Error("google-ads normalize not implemented yet");
  },
};
