import type {
  AuthContext,
  CanonicalRecord,
  Connector,
  DateRange,
  RawRecord,
} from "@ecomdash/core";

/**
 * WooCommerce connector. Same store-truth role as Shopify.
 *
 * - REST API consumer key + secret per site.
 * - Webhooks where the site supports them; otherwise daily paginated pull
 *   by date_modified over the trailing 30-day reconciliation window.
 * - Order-status inclusion is per-client configuration (which statuses count
 *   toward revenue), read from client_credentials.config.
 */

export interface WooConfig {
  clientId: string;
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
  /** Which order statuses count toward revenue, e.g. ["completed", "processing"]. */
  includedStatuses: string[];
}

export const wooConnector: Connector<WooConfig> = {
  source: "woo",
  restatementDays: 30,

  async authenticate(cfg: WooConfig): Promise<AuthContext> {
    return { clientId: cfg.clientId, provider: { ...cfg } };
  },

  // eslint-disable-next-line require-yield
  async *extract(_ctx: AuthContext, _range: DateRange): AsyncIterable<RawRecord> {
    // TODO: /wp-json/wc/v3/orders paginated by date_modified.
    throw new Error("woo extract not implemented yet");
  },

  normalize(_raw: RawRecord): CanonicalRecord[] {
    // TODO: map orders to fact_orders, filtered by includedStatuses.
    throw new Error("woo normalize not implemented yet");
  },
};
