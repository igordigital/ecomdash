/**
 * Shopify Admin REST API client. Auth is a custom-app access token in the
 * X-Shopify-Access-Token header (client/agency creates a custom app in the
 * Shopify admin and pastes the token here) -- not the public OAuth app
 * flow, which would need a registered/reviewed Shopify Partner app and is
 * overkill for a single agency connecting its own clients' stores.
 */

const API_VERSION = "2024-10";

export interface ShopifyCredentials {
  /** Normalized to the bare *.myshopify.com host, e.g. "pharm2u.myshopify.com" -- the Admin API never serves off a custom domain. */
  domain: string;
  accessToken: string;
}

export function normalizeShopifyDomain(input: string): string {
  let domain = input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  if (!domain.includes(".")) domain = `${domain}.myshopify.com`;
  return domain;
}

function authHeaders(token: string): HeadersInit {
  return { "X-Shopify-Access-Token": token, Accept: "application/json" };
}

/** Shopify's REST pagination is cursor-based via the Link response header, not page numbers. */
function nextPageInfo(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const next = linkHeader.split(",").find((part) => part.includes('rel="next"'));
  if (!next) return null;
  const match = /<([^>]+)>/.exec(next);
  if (!match?.[1]) return null;
  return new URL(match[1]).searchParams.get("page_info");
}

async function shopifyGet<T>(
  creds: ShopifyCredentials,
  path: string,
  params: Record<string, string>,
): Promise<{ data: T; nextPageInfo: string | null }> {
  const url = new URL(`https://${creds.domain}/admin/api/${API_VERSION}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: authHeaders(creds.accessToken) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Shopify API ${res.status} on ${path}: ${body.slice(0, 300) || res.statusText}`);
  }
  const data = (await res.json()) as T;
  return { data, nextPageInfo: nextPageInfo(res.headers.get("Link")) };
}

/** Lightweight reachability + auth check, used both when saving new credentials and by the first real pull. */
export async function testShopifyConnection(creds: ShopifyCredentials): Promise<void> {
  await shopifyGet(creds, "shop.json", {});
}

export interface ShopifyOrderRaw {
  id: number;
  created_at: string;
  currency: string;
  subtotal_price: string;
  total_discounts: string;
  financial_status: string;
  cancelled_at: string | null;
  customer: { id: number } | null;
  landing_site: string | null;
  line_items: { product_id: number | null; sku: string | null; title: string; quantity: number; price: string; total_discount?: string }[];
  refunds?: { transactions: { kind: string; amount: string }[] }[];
}

const MAX_PAGES = 200;

/**
 * Orders created within [afterIso, beforeIso). Fetched with status=any (no
 * financial_status filter): the REST API's financial_status param only
 * accepts a single value, not a list, so which statuses count toward
 * revenue is filtered client-side in shopify-ingest.ts against the client's
 * chosen set instead. Once page_info is present, Shopify requires it be the
 * *only* filter param on the request -- the original filters are already
 * encoded in the cursor.
 */
export async function fetchShopifyOrders(creds: ShopifyCredentials, afterIso: string, beforeIso: string): Promise<ShopifyOrderRaw[]> {
  const all: ShopifyOrderRaw[] = [];
  let pageInfo: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params: Record<string, string> = pageInfo
      ? { page_info: pageInfo, limit: "250" }
      : { status: "any", created_at_min: afterIso, created_at_max: beforeIso, limit: "250", order: "created_at asc" };
    const { data, nextPageInfo: next } = await shopifyGet<{ orders: ShopifyOrderRaw[] }>(creds, "orders.json", params);
    all.push(...data.orders);
    if (!next || data.orders.length === 0) break;
    pageInfo = next;
  }
  return all;
}

export interface ShopifyProductRaw {
  id: number;
  title: string;
  variants: { id: number; sku: string | null; price: string; inventory_quantity: number | null; inventory_management: string | null }[];
}

export async function fetchShopifyProducts(creds: ShopifyCredentials): Promise<ShopifyProductRaw[]> {
  const all: ShopifyProductRaw[] = [];
  let pageInfo: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params: Record<string, string> = pageInfo ? { page_info: pageInfo, limit: "250" } : { limit: "250" };
    const { data, nextPageInfo: next } = await shopifyGet<{ products: ShopifyProductRaw[] }>(creds, "products.json", params);
    all.push(...data.products);
    if (!next || data.products.length === 0) break;
    pageInfo = next;
  }
  return all;
}

/** Returns this customer's very first order id, used to classify a later order as new vs. returning. */
export async function fetchShopifyCustomerFirstOrderId(creds: ShopifyCredentials, customerId: number): Promise<number | null> {
  const { data } = await shopifyGet<{ orders: { id: number }[] }>(creds, "orders.json", {
    customer_id: String(customerId),
    status: "any",
    limit: "1",
    order: "created_at asc",
  });
  return data.orders[0]?.id ?? null;
}
