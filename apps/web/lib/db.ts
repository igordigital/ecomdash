import { Kysely, PostgresDialect, type Generated, type ColumnType } from "kysely";
import { Pool, types } from "pg";

/**
 * node-postgres returns SQL `date` columns as JS Date objects (parsed at
 * local-timezone midnight) by default, not the plain 'YYYY-MM-DD' string
 * every `date: string` column type in this file assumes. Raw sql`` queries
 * in dashboard-data.ts sidestepped this by explicitly casting to ::text,
 * but Kysely query-builder calls (e.g. ga4-ingest.ts reading ingest_jobs)
 * did not, and got a full ISO timestamp where a date string was expected.
 * OID 1082 is Postgres's `date` type; returning the raw wire string instead
 * of parsing it fixes every call site at once instead of patching each one.
 */
types.setTypeParser(1082, (value) => value);

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type Numeric = ColumnType<string, string | number, string | number>;

export interface DimClientTable {
  client_id: Generated<string>;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  status: Generated<"active" | "archived">;
  archived_at: Timestamp | null;
  created_at: Generated<Timestamp>;
}

export interface AppUserTable {
  id: Generated<string>;
  name: string;
  email: string;
  role: "admin" | "analyst" | "client";
  client_id: string | null;
  password_hash: string;
  created_at: Generated<Timestamp>;
}

export interface AgencyIntegrationTable {
  platform: "meta" | "google" | "ga4";
  connected: boolean;
  external_ref: unknown;
  connected_at: Timestamp | null;
}

export interface AgencyAdAccountTable {
  platform: "meta" | "google" | "ga4";
  external_id: string;
  name: string;
  currency: string | null;
  domain: string | null;
}

export interface ClientCredentialTable {
  client_id: string;
  source: "meta" | "google-ads" | "ga4" | "shopify" | "woo";
  vault_secret_id: string | null;
  config: unknown;
  status: "active" | "needs_reauth" | "disabled";
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface IngestJobTable {
  id: Generated<string>;
  client_id: string;
  source: string;
  date: string;
  kind: "backfill" | "daily";
  status: "pending" | "running" | "succeeded" | "failed";
  attempts: Generated<number>;
  last_error: string | null;
  started_at: Timestamp | null;
  finished_at: Timestamp | null;
  created_at: Generated<Timestamp>;
}

export interface DimCampaignMapTable {
  campaign_key: Generated<string>;
  client_id: string;
  platform: "meta" | "google";
  platform_campaign_id: string;
  platform_campaign_name: string;
  utm_campaign: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  google_ads_campaign_id: string | null;
  campaign_type: "Search" | "Performance Max" | "Shopping" | null;
  active: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface FactAdDailyTable {
  client_id: string;
  date: string;
  platform: "meta" | "google";
  campaign_id: string;
  campaign_name: Generated<string>;
  adset_id: string;
  adset_name: Generated<string>;
  ad_id: Generated<string>;
  ad_name: Generated<string>;
  spend: Numeric;
  impressions: Generated<string>;
  clicks: Generated<string>;
  platform_conversions: Numeric;
  platform_conv_value: Numeric;
  currency: string;
  attribution_window: Generated<string>;
  creative_type: "UGC video" | "Brand video" | "Static" | "Carousel" | "DPA" | null;
  atc: string | null;
  checkouts_initiated: string | null;
  reach: string | null;
  impression_share: Numeric | null;
  loaded_at: Generated<Timestamp>;
}

export interface FactOrdersTable {
  client_id: string;
  order_id: string;
  order_ts: Timestamp;
  order_date: string;
  gross_revenue: Numeric;
  discounts: Numeric;
  refunds: Numeric;
  net_revenue: Numeric;
  currency: string;
  item_count: Generated<number>;
  customer_type: "new" | "returning" | null;
  landing_site: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  financial_status: Generated<string>;
  loaded_at: Generated<Timestamp>;
}

export interface FactOrderItemsTable {
  client_id: string;
  order_id: string;
  order_date: string;
  sku: string;
  product_name: string;
  units: Generated<number>;
  revenue: Numeric;
  loaded_at: Generated<Timestamp>;
}

export interface DimProductTable {
  client_id: string;
  sku: string;
  name: string;
  price: Numeric | null;
  stock_status: "in_stock" | "low_stock" | "out_of_stock" | null;
  updated_at: Generated<Timestamp>;
}

export interface FactGa4CampaignTable {
  client_id: string;
  date: string;
  session_source_medium: string;
  session_campaign: string;
  device: string;
  sessions: Generated<string>;
  engaged_sessions: Generated<string>;
  engagement_rate: Numeric;
  ga4_conversions: Numeric;
  ga4_revenue: Numeric;
  add_to_carts: Generated<string>;
  loaded_at: Generated<Timestamp>;
}

export interface FactGa4ContentTable {
  client_id: string;
  date: string;
  session_source_medium: string;
  session_campaign: string;
  session_ad_content: string;
  sessions: Generated<string>;
  engaged_sessions: Generated<string>;
  engagement_rate: Numeric;
  ga4_conversions: Numeric;
  ga4_revenue: Numeric;
  add_to_carts: Generated<string>;
  loaded_at: Generated<Timestamp>;
}

export interface FactGa4TrafficTable {
  client_id: string;
  date: string;
  channel_group: string;
  source_medium: string;
  sessions: Generated<string>;
  engaged_sessions: Generated<string>;
  engagement_rate: Numeric;
  avg_session_duration: Numeric;
  bounce_rate: Numeric;
  new_users: Generated<string>;
  total_users: Generated<string>;
  add_to_carts: Generated<string>;
  transactions: Generated<string>;
  loaded_at: Generated<Timestamp>;
}

export interface FactGa4FunnelTable {
  client_id: string;
  date: string;
  add_to_carts: Generated<string>;
  checkouts: Generated<string>;
  loaded_at: Generated<Timestamp>;
}

export interface MartMerRollingTable {
  client_id: string;
  date: string;
  window: "7d" | "28d";
  total_spend_window: Numeric;
  store_net_revenue_window: Numeric;
  mer: Numeric | null;
  loaded_at: Generated<Timestamp>;
}

export interface MartCampaignHealthTable {
  client_id: string;
  date: string;
  platform: "meta" | "google";
  campaign_key: string;
  spend: Numeric;
  impressions: Generated<string>;
  clicks: Generated<string>;
  platform_roas: Numeric | null;
  ga4_sessions: string | null;
  ga4_engagement_rate: Numeric | null;
  loaded_at: Generated<Timestamp>;
}

export interface MartAnomaliesTable {
  id: Generated<string>;
  client_id: string;
  date: string;
  kind: "spend_swing" | "mer_move" | "conv_rate_drop";
  scope: unknown;
  impact_abs: Numeric;
  narrative: string | null;
  loaded_at: Generated<Timestamp>;
}

export interface Database {
  dim_client: DimClientTable;
  app_users: AppUserTable;
  agency_integrations: AgencyIntegrationTable;
  agency_ad_accounts: AgencyAdAccountTable;
  client_credentials: ClientCredentialTable;
  ingest_jobs: IngestJobTable;
  dim_campaign_map: DimCampaignMapTable;
  fact_ad_daily: FactAdDailyTable;
  fact_orders: FactOrdersTable;
  fact_order_items: FactOrderItemsTable;
  dim_product: DimProductTable;
  fact_ga4_campaign: FactGa4CampaignTable;
  fact_ga4_content: FactGa4ContentTable;
  fact_ga4_traffic: FactGa4TrafficTable;
  fact_ga4_funnel: FactGa4FunnelTable;
  mart_mer_rolling: MartMerRollingTable;
  mart_campaign_health: MartCampaignHealthTable;
  mart_anomalies: MartAnomaliesTable;
}

declare global {
  // eslint-disable-next-line no-var
  var __ecomdashDb: Kysely<Database> | undefined;
}

/**
 * Same globalThis-singleton pattern as the admin store: Next.js can
 * instantiate this module separately across the RSC/Server Action build
 * graph, and a plain module-level pool would silently create multiple pools
 * (and exhaust Supabase's connection limit) instead of sharing one.
 *
 * Exported as a function, not `export const db = getDb()`: a module-level
 * call would run at `next build`'s static page-data collection time (no real
 * request, and potentially no DATABASE_URL in that shell) and fail the build
 * itself, the same way an eager SESSION_SECRET check once did in
 * lib/auth.ts. Call sites use `getDb()` rather than a lazily-proxied `db`
 * object so method calls keep their correct `this` binding.
 */
export function getDb(): Kysely<Database> {
  if (!globalThis.__ecomdashDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");
    globalThis.__ecomdashDb = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString, max: 10 }) }),
    });
  }
  return globalThis.__ecomdashDb;
}
