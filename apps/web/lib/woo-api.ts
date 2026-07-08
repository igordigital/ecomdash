/**
 * WooCommerce REST API v3 client. Auth is HTTP Basic (consumer key/secret) in
 * the Authorization header, which requires the store to be served over
 * HTTPS — WooCommerce only falls back to an OAuth1.0a query-string signature
 * over plain HTTP, which this client does not implement (every real store in
 * 2026 is HTTPS).
 */

export interface WooCredentials {
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

export function normalizeWooSiteUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

function authHeader(creds: WooCredentials): string {
  const token = Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`).toString("base64");
  return `Basic ${token}`;
}

async function wooGet<T>(creds: WooCredentials, path: string, params: Record<string, string>): Promise<{ data: T; totalPages: number }> {
  const url = new URL(`${creds.siteUrl}/wp-json/wc/v3/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: authHeader(creds), Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`WooCommerce API ${res.status} on ${path}: ${body.slice(0, 300) || res.statusText}`);
  }
  const data = (await res.json()) as T;
  const totalPages = Number(res.headers.get("X-WP-TotalPages") ?? "1") || 1;
  return { data, totalPages };
}

/** Lightweight reachability + auth check, used both when saving new credentials and by the first real pull. */
export async function testWooConnection(creds: WooCredentials): Promise<void> {
  await wooGet(creds, "orders", { per_page: "1" });
}

export interface WooOrderRaw {
  id: number;
  status: string;
  currency: string;
  date_created_gmt: string;
  customer_id: number;
  total: string;
  discount_total: string;
  shipping_total: string;
  total_tax: string;
  line_items: { product_id: number; sku: string; name: string; quantity: number; total: string }[];
  refunds?: { id: number; total: string }[];
  meta_data?: { key: string; value: unknown }[];
}

const MAX_PAGES = 200;

/** Orders created within [afterIso, beforeIso), filtered server-side to the statuses that count toward revenue. */
export async function fetchWooOrders(creds: WooCredentials, afterIso: string, beforeIso: string, statuses: string[]): Promise<WooOrderRaw[]> {
  const all: WooOrderRaw[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, totalPages } = await wooGet<WooOrderRaw[]>(creds, "orders", {
      after: afterIso,
      before: beforeIso,
      status: statuses.join(","),
      per_page: "100",
      page: String(page),
      orderby: "date",
      order: "asc",
    });
    all.push(...data);
    if (page >= totalPages || data.length === 0) break;
  }
  return all;
}

export interface WooProductRaw {
  id: number;
  name: string;
  sku: string;
  price: string;
  regular_price: string;
  stock_status: "instock" | "outofstock" | "onbackorder";
  manage_stock: boolean;
  stock_quantity: number | null;
}

export async function fetchWooProducts(creds: WooCredentials): Promise<WooProductRaw[]> {
  const all: WooProductRaw[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, totalPages } = await wooGet<WooProductRaw[]>(creds, "products", { per_page: "100", page: String(page) });
    all.push(...data);
    if (page >= totalPages || data.length === 0) break;
  }
  return all;
}

/** Returns this customer's very first order id, used to classify a later order as new vs. returning. */
export async function fetchWooCustomerFirstOrderId(creds: WooCredentials, customerId: number): Promise<number | null> {
  const { data } = await wooGet<{ id: number }[]>(creds, "orders", {
    customer: String(customerId),
    per_page: "1",
    orderby: "date",
    order: "asc",
  });
  return data[0]?.id ?? null;
}
