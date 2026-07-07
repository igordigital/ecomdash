import type {
  AuthContext,
  CanonicalRecord,
  Connector,
  DateRange,
  RawRecord,
} from "@ecomdash/core";

/**
 * GA4 Data API connector. Two report shapes:
 *
 * fact_ga4_traffic (site health, no crosswalk; the quick win):
 *   dims [date, defaultChannelGroup, sessionSourceMedium]
 *   metrics [sessions, engagedSessions, engagementRate,
 *            averageSessionDuration, bounceRate, newUsers, totalUsers]
 *
 * fact_ga4_campaign (paid-traffic validation at campaign level only):
 *   dims [date, sessionSourceMedium, sessionCampaignName, deviceCategory]
 *   metrics [sessions, engagedSessions, engagementRate, conversions, totalRevenue]
 *
 * - Agency-level OAuth (apps/web/lib/ga4-oauth.ts), not a service account: one
 *   Google account signs in once and lists whichever properties it already
 *   has Viewer access to. authenticate() exchanges the stored refresh token
 *   for a short-lived access token per run.
 * - One day per request during backfill: avoids the (other) row-cap bucket
 *   and sampling. Throttle against per-property quota tokens.
 * - Restatement: trailing 7 days (late hits + reprocessing).
 */

export interface Ga4Config {
  clientId: string;
  propertyId: string;
  refreshToken: string;
}

export const ga4Connector: Connector<Ga4Config> = {
  source: "ga4",
  restatementDays: 7,

  async authenticate(cfg: Ga4Config): Promise<AuthContext> {
    // TODO(phase-3): exchange cfg.refreshToken for an access token via the
    // same token endpoint apps/web/lib/ga4-oauth.ts#refreshGa4AccessToken uses.
    return {
      clientId: cfg.clientId,
      provider: { propertyId: cfg.propertyId, refreshToken: cfg.refreshToken },
    };
  },

  // eslint-disable-next-line require-yield
  async *extract(_ctx: AuthContext, _range: DateRange): AsyncIterable<RawRecord> {
    // TODO(phase-3): runReport per day per report shape via @google-analytics/data.
    throw new Error("ga4 extract not implemented yet");
  },

  normalize(_raw: RawRecord): CanonicalRecord[] {
    // TODO(phase-3): map report rows to fact_ga4_traffic / fact_ga4_campaign.
    // ga4_conversions / ga4_revenue are DIAGNOSTIC ONLY (Invariant 1).
    throw new Error("ga4 normalize not implemented yet");
  },
};
