import type {
  AuthContext,
  CanonicalRecord,
  Connector,
  DateRange,
  RawRecord,
} from "@ecomdash/core";

/**
 * Shopify connector. The store is the source of truth for revenue (Invariant 1).
 *
 * - Admin API token per shop.
 * - Primary intake via webhooks (orders/create, orders/updated, refunds/create),
 *   handled by the worker's webhook endpoint, not this connector.
 * - This connector implements the daily reconciliation pull over a trailing
 *   30-day window: late refunds, cancellations, financial_status changes.
 * - net_revenue = gross - refunds; order_date in store timezone drives MER.
 */

export interface ShopifyConfig {
  clientId: string;
  shopDomain: string;
  adminApiToken: string;
}

export const shopifyConnector: Connector<ShopifyConfig> = {
  source: "shopify",
  restatementDays: 30,

  async authenticate(cfg: ShopifyConfig): Promise<AuthContext> {
    return {
      clientId: cfg.clientId,
      provider: { shopDomain: cfg.shopDomain, token: cfg.adminApiToken },
    };
  },

  // eslint-disable-next-line require-yield
  async *extract(_ctx: AuthContext, _range: DateRange): AsyncIterable<RawRecord> {
    // TODO(slice-1): paginate orders by updated_at, read financial_status
    // and refund records.
    throw new Error("shopify extract not implemented yet");
  },

  normalize(_raw: RawRecord): CanonicalRecord[] {
    // TODO(slice-1): map orders to fact_orders rows (net_revenue = gross - refunds).
    throw new Error("shopify normalize not implemented yet");
  },
};
