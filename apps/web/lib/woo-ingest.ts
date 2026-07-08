/**
 * Processes queued WooCommerce ingest_jobs directly, same "simple" shape as
 * ga4-ingest.ts / meta-ingest.ts (no separate worker service or pg-boss
 * queue). Each job's `date` is a calendar day in the client's own timezone;
 * WooCommerce's after/before params are UTC instants, so that day is
 * converted to a UTC window before the request goes out. The product
 * catalog isn't day-scoped, so it's synced once per run rather than once
 * per job, mirroring meta-ingest.ts's "fetch the account currency once per
 * run" pattern.
 */

import { getDb } from "./db";
import { fetchWooCustomerFirstOrderId, fetchWooOrders, fetchWooProducts, type WooCredentials, type WooOrderRaw } from "./woo-api";

export interface WooJobResult {
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

/** Converts a client-local calendar day into the UTC instant range WooCommerce's after/before params expect. */
function localDayToUtcRange(date: string, timeZone: string): { afterIso: string; beforeIso: string } {
  const naiveStart = new Date(`${date}T00:00:00Z`);
  const offsetMin = tzOffsetMinutes(naiveStart, timeZone);
  const startUtc = new Date(naiveStart.getTime() - offsetMin * 60_000);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { afterIso: startUtc.toISOString(), beforeIso: endUtc.toISOString() };
}

/** WooCommerce's built-in Order Attribution feature (core since 8.5) stores UTM/landing meta on the order. */
const ATTRIBUTION_META: Record<string, "utm_source" | "utm_medium" | "utm_campaign" | "landing_site"> = {
  _wc_order_attribution_utm_source: "utm_source",
  _wc_order_attribution_utm_medium: "utm_medium",
  _wc_order_attribution_utm_campaign: "utm_campaign",
  _wc_order_attribution_session_entry: "landing_site",
};

function extractAttribution(order: WooOrderRaw): { utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; landingSite: string | null } {
  const out = { utmSource: null as string | null, utmMedium: null as string | null, utmCampaign: null as string | null, landingSite: null as string | null };
  for (const m of order.meta_data ?? []) {
    const field = ATTRIBUTION_META[m.key];
    if (!field || typeof m.value !== "string" || !m.value) continue;
    if (field === "utm_source") out.utmSource = m.value;
    else if (field === "utm_medium") out.utmMedium = m.value;
    else if (field === "utm_campaign") out.utmCampaign = m.value;
    else out.landingSite = m.value;
  }
  return out;
}

/** For required numeric fields where a missing/unparseable value safely defaults to 0 (tax, shipping, discounts). */
function num(v: string | undefined | null): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** For nullable money fields (product price) where 0 is a real value and must not collapse into "unknown". */
function parseMoney(v: string | undefined | null): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * customer_id is 0 for guest checkout, which WooCommerce doesn't let us
 * reliably identify across orders, so guests are left null (unknown) rather
 * than guessed. Registered customers are classified by comparing this order
 * against their very first order; results are cached per run since the same
 * customer often appears across multiple days/orders in one backfill.
 */
async function classifyCustomer(creds: WooCredentials, order: WooOrderRaw, cache: Map<number, number | null>): Promise<"new" | "returning" | null> {
  if (!order.customer_id) return null;
  if (!cache.has(order.customer_id)) {
    cache.set(order.customer_id, await fetchWooCustomerFirstOrderId(creds, order.customer_id));
  }
  return cache.get(order.customer_id) === order.id ? "new" : "returning";
}

async function upsertOrders(clientId: string, jobDate: string, creds: WooCredentials, orders: WooOrderRaw[]): Promise<void> {
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
    // "Gross" here excludes tax and shipping, matching the net-sales convention used elsewhere in this app.
    const grossRevenue = num(o.total) - num(o.total_tax) - num(o.shipping_total);
    const refundsTotal = (o.refunds ?? []).reduce((s, r) => s + Math.abs(num(r.total)), 0);
    const attribution = extractAttribution(o);
    const customerType = await classifyCustomer(creds, o, customerCache);

    orderRows.push({
      client_id: clientId,
      order_id: String(o.id),
      order_ts: o.date_created_gmt.endsWith("Z") ? o.date_created_gmt : `${o.date_created_gmt}Z`,
      order_date: jobDate,
      gross_revenue: grossRevenue,
      discounts: num(o.discount_total),
      refunds: refundsTotal,
      net_revenue: grossRevenue - refundsTotal,
      currency: o.currency,
      item_count: o.line_items.reduce((s, li) => s + li.quantity, 0),
      customer_type: customerType,
      landing_site: attribution.landingSite,
      utm_source: attribution.utmSource,
      utm_medium: attribution.utmMedium,
      utm_campaign: attribution.utmCampaign,
      financial_status: o.status,
    });

    const bySku = new Map<string, { name: string; units: number; revenue: number }>();
    for (const li of o.line_items) {
      const sku = li.sku && li.sku.trim() ? li.sku.trim() : `woo-${li.product_id}`;
      const existing = bySku.get(sku) ?? { name: li.name, units: 0, revenue: 0 };
      existing.units += li.quantity;
      existing.revenue += num(li.total);
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

/** onbackorder / low stock_quantity both read as "low_stock" in the UI; core Woo's stock_status alone only has instock/outofstock/onbackorder. */
function mapStockStatus(p: { stock_status: string; manage_stock: boolean; stock_quantity: number | null }): "in_stock" | "low_stock" | "out_of_stock" {
  if (p.stock_status === "outofstock") return "out_of_stock";
  if (p.stock_status === "onbackorder") return "low_stock";
  if (p.manage_stock && typeof p.stock_quantity === "number" && p.stock_quantity <= 5) return "low_stock";
  return "in_stock";
}

async function syncProducts(clientId: string, creds: WooCredentials): Promise<void> {
  const products = await fetchWooProducts(creds);
  if (products.length === 0) return;
  const rows = products.map((p) => ({
    client_id: clientId,
    sku: p.sku && p.sku.trim() ? p.sku.trim() : `woo-${p.id}`,
    name: p.name,
    price: parseMoney(p.price) ?? parseMoney(p.regular_price),
    stock_status: mapStockStatus(p),
  }));
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

/** Runs every pending WooCommerce ingest_jobs row for this client, oldest first, sequentially (one store, respect it). */
export async function runPendingWooJobs(clientId: string): Promise<WooJobResult[]> {
  const db = getDb();

  const cred = await db.selectFrom("client_credentials").select("config").where("client_id", "=", clientId).where("source", "=", "woo").executeTakeFirst();
  const config = cred?.config as { domain?: string; consumerKey?: string; consumerSecret?: string; includedStatuses?: string[] } | undefined;
  if (!config?.domain || !config.consumerKey || !config.consumerSecret) {
    throw new Error("This client has no WooCommerce store connected yet.");
  }
  const creds: WooCredentials = { siteUrl: config.domain, consumerKey: config.consumerKey, consumerSecret: config.consumerSecret };
  const includedStatuses = config.includedStatuses && config.includedStatuses.length > 0 ? config.includedStatuses : ["completed", "processing"];

  const client = await db.selectFrom("dim_client").select("timezone").where("client_id", "=", clientId).executeTakeFirst();
  const timezone = client?.timezone ?? "UTC";

  const jobs = await db
    .selectFrom("ingest_jobs")
    .selectAll()
    .where("client_id", "=", clientId)
    .where("source", "=", "woo")
    .where("status", "=", "pending")
    .orderBy("date", "asc")
    .execute();

  if (jobs.length > 0) {
    await syncProducts(clientId, creds);
  }

  const results: WooJobResult[] = [];
  for (const job of jobs) {
    await db.updateTable("ingest_jobs").set({ status: "running", started_at: new Date(), attempts: job.attempts + 1 }).where("id", "=", job.id).execute();
    try {
      const { afterIso, beforeIso } = localDayToUtcRange(job.date, timezone);
      const orders = await fetchWooOrders(creds, afterIso, beforeIso, includedStatuses);
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
