import { z } from "zod";
import type {
  AuthContext,
  CanonicalRecord,
  Connector,
  DateRange,
  RawRecord,
} from "@ecomdash/core";
import { adDailyRow } from "@ecomdash/core";

/**
 * Meta Marketing API connector. Ad-level insights.
 *
 * - System user token (long-lived, server-to-server) via the agency BM.
 * - /act_{ad_account_id}/insights, level=ad, time_increment=1.
 * - Attribution windows set explicitly and recorded on every row.
 * - Large backfills use the async report flow (submit, poll, download);
 *   extract() handles that internally, one day per yielded batch.
 * - Restatement: trailing 28 days re-pulled daily (conversions restate).
 */

export interface MetaConfig {
  clientId: string;
  adAccountId: string;
  systemUserToken: string;
  apiVersion: string; // pinned at build time, e.g. "v21.0"
}

const ATTRIBUTION_WINDOW = "7d_click_1d_view";

const insightRow = z.object({
  date_start: z.string(),
  campaign_id: z.string(),
  campaign_name: z.string().default(""),
  adset_id: z.string(),
  adset_name: z.string().default(""),
  ad_id: z.string(),
  ad_name: z.string().default(""),
  spend: z.coerce.number().default(0),
  impressions: z.coerce.number().default(0),
  clicks: z.coerce.number().default(0),
  account_currency: z.string().default("USD"),
  actions: z.array(z.object({ action_type: z.string(), value: z.coerce.number() })).default([]),
  action_values: z
    .array(z.object({ action_type: z.string(), value: z.coerce.number() }))
    .default([]),
});

function actionValue(
  actions: { action_type: string; value: number }[],
  type: string,
): number {
  return actions.find((a) => a.action_type === type)?.value ?? 0;
}

export const metaConnector: Connector<MetaConfig> = {
  source: "meta",
  restatementDays: 28,

  async authenticate(cfg: MetaConfig): Promise<AuthContext> {
    // Token validity is checked on first extract call; a 190 error surfaces
    // as needs_reauth in client_credentials (connector-error re-auth pattern).
    return {
      clientId: cfg.clientId,
      provider: {
        adAccountId: cfg.adAccountId,
        token: cfg.systemUserToken,
        apiVersion: cfg.apiVersion,
      },
    };
  },

  // eslint-disable-next-line require-yield
  async *extract(_ctx: AuthContext, _range: DateRange): AsyncIterable<RawRecord> {
    // TODO(slice-1): async insights report flow with Business-Use-Case
    // rate-limit backoff. Yields one RawRecord per insight row.
    throw new Error("meta extract not implemented yet");
  },

  normalize(raw: RawRecord): CanonicalRecord[] {
    const payload = insightRow.parse(
      (raw.payload as { clientId: string; row: unknown }).row,
    );
    const clientId = (raw.payload as { clientId: string }).clientId;
    return [
      {
        table: "fact_ad_daily",
        row: adDailyRow.parse({
          client_id: clientId,
          date: payload.date_start,
          platform: "meta",
          campaign_id: payload.campaign_id,
          campaign_name: payload.campaign_name,
          adset_id: payload.adset_id,
          adset_name: payload.adset_name,
          ad_id: payload.ad_id,
          ad_name: payload.ad_name,
          spend: payload.spend,
          impressions: payload.impressions,
          clicks: payload.clicks,
          // DIAGNOSTIC ONLY: never summed across platforms (Invariant 1).
          platform_conversions: actionValue(payload.actions, "purchase"),
          platform_conv_value: actionValue(payload.action_values, "purchase"),
          currency: payload.account_currency,
          attribution_window: ATTRIBUTION_WINDOW,
        }),
      },
    ];
  },
};
