/**
 * Processes queued Shopify ingest_jobs directly, same "simple" shape as
 * woo-ingest.ts (no separate worker service or pg-boss queue). Each job's
 * `date` is a calendar day in the client's own timezone; Shopify's
 * created_at_min/max params are UTC instants, so that day is converted to a
 * UTC window before the request goes out, identically to woo-ingest.ts. The
 * product catalog isn't day-scoped, so it's synced once per run rather than
 * once per job.
 */

import { getDb } from "./db";
import { reclaimStaleRunningJobs } from "./ingest-jobs";
import { fetchShopifyCustomerFirstOrderId, fetchShopifyOrders, fetchShopifyProducts, type ShopifyCredentials, type ShopifyOrderRaw } from "./shopify-api";

export interface ShopifyJobResult {
  date: string;
  ok: boolean;
  error?: string;
}

function tzOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(date);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
  const m = /GMT([+-]\d+)(?::(\d+))?/.exec(tzName);
  if (!m) return 0;
  const hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  return hours * 60 + (hours < 0 ? -minutes : minutes);
}

/** Converts a client-local calendar day into the UTC instant range Shopify's created_at_min/max params expect. */
function localDayToUtcRange(date: string, timeZone: string): { afterIso: string; beforeIso: string } {
  const naiveStart = new Date(`${date}T00:00:00Z`);
  const offsetMin = tzOffsetMinutes(naiveStart, timeZone);
  const startUtc = new Date(naiveStart.getTime() - offsetMin * 60_000);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { afterIso: startUtc.toISOString(), beforeIso: endUtc.toISOString() };
}

/** Shopify doesn't expose separate utm_* fields on core REST orders; landing_site is the first-page URL of that session, so utm params are parsed out of its query string when present. */
function extractAttribution(order: ShopifyOrderRaw): { utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; landingSite: string | null } {
  const landingSite = order.landing_site ?? null;
  const out = { utmSource: null as string | null, utmMedium: null as string | null, utmCampaign: null as string | null, landingSite };
  if (!landingSite) return out;
  try {
    const url = new URL(landingSite, "https://placeholder.invalid");
    out.utmSource = url.searchParams.get("utm_source");
    out.utmMedium = url.searchParams.get("utm_medium");
    out.utmCampaign = url.searchParams.get("utm_campaign");
  } catch {
    // landing_site wasn't a parseable URL/path; leave utm fields null.
  }
  return out;
}

function num(v: string | undefined | null): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseMoney(v: string | undefined | null): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Guest checkouts have no customer object and are left null (unknown)
 * rather than guessed. Registered customers are classified by comparing
 * this order against their very first order; results are cached per run
 * since the same customer often appears across multiple days/orders in one
 * backfill.
 */
async function classifyCustomer(creds: ShopifyCredentials, order: ShopifyOrderRaw, cache: Map<number, number | null>): Promise<"new" | "returning" | null> {
  const customerId = order.customer?.id;
  if (!customerId) return null;
  if (!cache.has(customerId)) {
    cache.set(customerId, await fetchShopifyCustomerFirstOrderId(creds, customerId));
  }
  return cache.get(customerId) === order.id ? "new" : "returning";
}

async function upsertOrders(clientId: string, jobDate: string, creds: ShopifyCredentials, orders: ShopifyOrderRaw[]): Promise<void> {
  if (orders.length === 0) return;
  const db = getDb();
  const customerCache = new Map<number, number | null>();

  const orderRows: {
    client_id: string;
    order_id: string;
    order_ts: string;
    order_date: string;
    gross_revenue: number;
    discounts: number;
    refunds: number;
    net_revenue: number;
    currency: string;
    item_count: number;
    customer_type: "new" | "returning" | null;
    landing_site: string | null;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    financial_status: string;
  }[] = [];
  const itemRows: { client_id: string; order_id: string; order_date: string; sku: string; product_name: string; units: number; revenue: number }[] = [];

  for (const o of orders) {
    // subtotal_price is already post-discount, pre-tax/shipping -- the same "net sales" convention woo-ingest.ts derives by hand from total - tax - shipping.
    const grossRevenue = num(o.subtotal_price);
    const refundsTotal = (o.refunds ?? []).reduce(
      (s, r) => s + r.transactions.filter((t) => t.kind === "refund").reduce((ts, t) => ts + Math.abs(num(t.amount)), 0),
      0,
    );
    const attribution = extractAttribution(o);
    const customerType = await classifyCustomer(creds, o, customerCache);

    orderRows.push({
      client_id: clientId,
      order_id: String(o.id),
      order_ts: o.created_at,
      order_date: jobDate,
      gross_revenue: grossRevenue,
      discounts: num(o.total_discounts),
      refunds: refundsTotal,
      net_revenue: grossRevenue - refundsTotal,
      currency: o.currency,
      item_count: o.line_items.reduce((s, li) => s + li.quantity, 0),
      customer_type: customerType,
      landing_site: attribution.landingSite,
      utm_source: attribution.utmSource,
      utm_medium: attribution.utmMedium,
      utm_campaign: attribution.utmCampaign,
      financial_status: o.financial_status,
    });

    const bySku = new Map<string, { name: string; units: number; revenue: number }>();
    for (const li of o.line_items) {
      const sku = li.sku && li.sku.trim() ? li.sku.trim() : `shopify-${li.product_id ?? o.id}`;
      const existing = bySku.get(sku) ?? { name: li.title, units: 0, revenue: 0 };
      existing.units += li.quantity;
      existing.revenue += num(li.price) * li.quantity - num(li.total_discount);
      bySku.set(sku, existing);
    }
    for (const [sku, v] of bySku) {
      itemRows.push({ client_id: clientId, order_id: String(o.id), order_date: jobDate, sku, product_name: v.name, units: v.units, revenue: v.revenue });
    }
  }

  await db
    .insertInto("fact_orders")
    .values(orderRows)
    .onConflict((oc) =>
      oc.columns(["client_id", "order_id"]).doUpdateSet((eb) => ({
        order_ts: eb.ref("excluded.order_ts"),
        order_date: eb.ref("excluded.order_date"),
        gross_revenue: eb.ref("excluded.gross_revenue"),
        discounts: eb.ref("excluded.discounts"),
        refunds: eb.ref("excluded.refunds"),
        net_revenue: eb.ref("excluded.net_revenue"),
        currency: eb.ref("excluded.currency"),
        item_count: eb.ref("excluded.item_count"),
        customer_type: eb.ref("excluded.customer_type"),
        landing_site: eb.ref("excluded.landing_site"),
        utm_source: eb.ref("excluded.utm_source"),
        utm_medium: eb.ref("excluded.utm_medium"),
        utm_campaign: eb.ref("excluded.utm_campaign"),
        financial_status: eb.ref("excluded.financial_status"),
        loaded_at: new Date(),
      })),
    )
    .execute();

  if (itemRows.length > 0) {
    await db
      .insertInto("fact_order_items")
      .values(itemRows)
      .onConflict((oc) =>
        oc.columns(["client_id", "order_id", "sku"]).doUpdateSet((eb) => ({
          product_name: eb.ref("excluded.product_name"),
          units: eb.ref("excluded.units"),
          revenue: eb.ref("excluded.revenue"),
          loaded_at: new Date(),
        })),
      )
      .execute();
  }
}

function mapStockStatus(v: { inventory_quantity: number | null; inventory_management: string | null }): "in_stock" | "low_stock" | "out_of_stock" {
  if (v.inventory_management !== "shopify" || v.inventory_quantity === null) return "in_stock";
  if (v.inventory_quantity <= 0) return "out_of_stock";
  if (v.inventory_quantity <= 5) return "low_stock";
  return "in_stock";
}

async function syncProducts(clientId: string, creds: ShopifyCredentials): Promise<void> {
  const products = await fetchShopifyProducts(creds);
  if (products.length === 0) return;
  const rows = products.flatMap((p) =>
    p.variants.map((v) => ({
      client_id: clientId,
      sku: v.sku && v.sku.trim() ? v.sku.trim() : `shopify-${v.id}`,
      name: p.variants.length > 1 ? `${p.title}` : p.title,
      price: parseMoney(v.price),
      stock_status: mapStockStatus(v),
    })),
  );
  await getDb()
    .insertInto("dim_product")
    .values(rows)
    .onConflict((oc) =>
      oc.columns(["client_id", "sku"]).doUpdateSet((eb) => ({
        name: eb.ref("excluded.name"),
        price: eb.ref("excluded.price"),
        stock_status: eb.ref("excluded.stock_status"),
        updated_at: new Date(),
      })),
    )
    .execute();
}

/** Runs every pending Shopify ingest_jobs row for this client, oldest first, sequentially (one store, respect it). */
export async function runPendingShopifyJobs(clientId: string): Promise<ShopifyJobResult[]> {
  const db = getDb();

  const cred = await db.selectFrom("client_credentials").select("config").where("client_id", "=", clientId).where("source", "=", "shopify").executeTakeFirst();
  const config = cred?.config as { domain?: string; accessToken?: string; includedStatuses?: string[] } | undefined;
  if (!config?.domain || !config.accessToken) {
    throw new Error("This client has no Shopify store connected yet.");
  }
  const creds: ShopifyCredentials = { domain: config.domain, accessToken: config.accessToken };
  const includedStatuses = config.includedStatuses && config.includedStatuses.length > 0 ? config.includedStatuses : ["paid"];

  const client = await db.selectFrom("dim_client").select("timezone").where("client_id", "=", clientId).executeTakeFirst();
  const timezone = client?.timezone ?? "UTC";

  await reclaimStaleRunningJobs(clientId, "shopify");

  // Newest first: the days someone is actually looking at (recent) land before deep history,
  // instead of a multi-month backfill delaying "yesterday" until everything before it is done.
  const jobs = await db
    .selectFrom("ingest_jobs")
    .selectAll()
    .where("client_id", "=", clientId)
    .where("source", "=", "shopify")
    .where("status", "=", "pending")
    .orderBy("date", "desc")
    .execute();

  if (jobs.length > 0) {
    await syncProducts(clientId, creds);
  }

  const results: ShopifyJobResult[] = [];
  for (const job of jobs) {
    await db.updateTable("ingest_jobs").set({ status: "running", started_at: new Date(), attempts: job.attempts + 1 }).where("id", "=", job.id).execute();
    try {
      const { afterIso, beforeIso } = localDayToUtcRange(job.date, timezone);
      const allOrders = await fetchShopifyOrders(creds, afterIso, beforeIso);
      // Cancelled orders never count toward revenue regardless of financial_status; the remaining
      // statuses are filtered against the client's chosen set (server-side status filtering isn't
      // available for a list of financial_status values on this endpoint -- see shopify-api.ts).
      const orders = allOrders.filter((o) => !o.cancelled_at && includedStatuses.includes(o.financial_status));
      await upsertOrders(clientId, job.date, creds, orders);
      await db.updateTable("ingest_jobs").set({ status: "succeeded", finished_at: new Date() }).where("id", "=", job.id).execute();
      results.push({ date: job.date, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.updateTable("ingest_jobs").set({ status: "failed", finished_at: new Date(), last_error: message.slice(0, 500) }).where("id", "=", job.id).execute();
      results.push({ date: job.date, ok: false, error: message });
    }
  }
  return results;
}
