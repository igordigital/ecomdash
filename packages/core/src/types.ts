import { z } from "zod";

/**
 * Canonical row shapes. These mirror the warehouse fact tables exactly.
 * Grain discipline: fact_ad_daily is platform x campaign x group x ad x date.
 * platform_conversions / platform_conv_value are DIAGNOSTIC ONLY and must
 * never be summed across platforms (see invariant 1).
 */

export const adDailyRow = z.object({
  client_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  platform: z.enum(["meta", "google"]),
  campaign_id: z.string().min(1),
  campaign_name: z.string(),
  adset_id: z.string().min(1),
  adset_name: z.string(),
  /** Meta: populated. Google: "" at v1 grain (campaign + ad_group). */
  ad_id: z.string(),
  ad_name: z.string(),
  spend: z.number().nonnegative(),
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  platform_conversions: z.number().nonnegative(),
  platform_conv_value: z.number().nonnegative(),
  currency: z.string().length(3),
  attribution_window: z.string(),
});
export type AdDailyRow = z.infer<typeof adDailyRow>;

export const orderRow = z.object({
  client_id: z.string().uuid(),
  order_id: z.string().min(1),
  order_ts: z.string(),
  order_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gross_revenue: z.number(),
  discounts: z.number(),
  refunds: z.number(),
  /** gross - refunds; the MER numerator. */
  net_revenue: z.number(),
  currency: z.string().length(3),
  item_count: z.number().int().nonnegative(),
  customer_type: z.enum(["new", "returning"]).nullable(),
  landing_site: z.string().nullable(),
  utm_source: z.string().nullable(),
  utm_medium: z.string().nullable(),
  utm_campaign: z.string().nullable(),
  financial_status: z.string(),
});
export type OrderRow = z.infer<typeof orderRow>;

export const ga4CampaignRow = z.object({
  client_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  session_source_medium: z.string(),
  session_campaign: z.string(),
  device: z.string(),
  sessions: z.number().int().nonnegative(),
  engaged_sessions: z.number().int().nonnegative(),
  engagement_rate: z.number().nonnegative(),
  ga4_conversions: z.number().nonnegative(),
  ga4_revenue: z.number().nonnegative(),
});
export type Ga4CampaignRow = z.infer<typeof ga4CampaignRow>;

export const ga4TrafficRow = z.object({
  client_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  channel_group: z.string(),
  source_medium: z.string(),
  sessions: z.number().int().nonnegative(),
  engaged_sessions: z.number().int().nonnegative(),
  engagement_rate: z.number().nonnegative(),
  avg_session_duration: z.number().nonnegative(),
  bounce_rate: z.number().nonnegative(),
  new_users: z.number().int().nonnegative(),
  total_users: z.number().int().nonnegative(),
});
export type Ga4TrafficRow = z.infer<typeof ga4TrafficRow>;

export type CanonicalRecord =
  | { table: "fact_ad_daily"; row: AdDailyRow }
  | { table: "fact_orders"; row: OrderRow }
  | { table: "fact_ga4_campaign"; row: Ga4CampaignRow }
  | { table: "fact_ga4_traffic"; row: Ga4TrafficRow };
