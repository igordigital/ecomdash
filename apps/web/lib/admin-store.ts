/**
 * Admin panel data layer, backed by Supabase Postgres (dim_client,
 * app_users, client_credentials, ingest_jobs, agency_integrations,
 * agency_ad_accounts). Replaces the old globalThis in-memory demo store.
 *
 * Meta, Google Ads, and GA4 are authorized ONCE at the agency level
 * (agency_integrations + agency_ad_accounts); assigning a client to a
 * platform is then just picking an already-visible account/property
 * (client_credentials), never a new OAuth flow. Shopify and WooCommerce
 * cannot be pre-authorized this way, so they keep a per-client connect step.
 */

import { sql } from "kysely";
import { getDb } from "./db";

export type Role = "admin" | "analyst" | "client";

export interface GoogleAdsAccount {
  customerId: string;
  name: string;
  currency: string;
}

export interface MetaAdAccount {
  accountId: string;
  name: string;
  currency: string;
}

export interface Ga4Property {
  propertyId: string;
  name: string;
  domain: string;
}

export interface GoogleIntegration {
  connected: boolean;
  mccId: string;
  developerTokenStatus: "approved" | "pending";
  connectedAt: string | null;
}
export interface MetaIntegration {
  connected: boolean;
  businessManagerId: string;
  businessManagerName: string;
  connectedAt: string | null;
}
export interface Ga4Integration {
  connected: boolean;
  serviceAccountEmail: string;
  connectedAt: string | null;
}
export interface AgencyIntegrations {
  google: GoogleIntegration;
  meta: MetaIntegration;
  ga4: Ga4Integration;
}

export async function getAgencyIntegrations(): Promise<AgencyIntegrations> {
  const rows = await getDb().selectFrom("agency_integrations").selectAll().execute();
  const byPlatform = new Map(rows.map((r) => [r.platform, r]));
  const g = byPlatform.get("google");
  const m = byPlatform.get("meta");
  const a = byPlatform.get("ga4");
  const ref = <T>(row: typeof g, fallback: T): T => (row?.external_ref as T) ?? fallback;
  return {
    google: {
      connected: g?.connected ?? false,
      connectedAt: g?.connected_at ? String(g.connected_at).slice(0, 10) : null,
      ...ref(g, { mccId: "", developerTokenStatus: "pending" as const }),
    },
    meta: {
      connected: m?.connected ?? false,
      connectedAt: m?.connected_at ? String(m.connected_at).slice(0, 10) : null,
      ...ref(m, { businessManagerId: "", businessManagerName: "" }),
    },
    ga4: {
      connected: a?.connected ?? false,
      connectedAt: a?.connected_at ? String(a.connected_at).slice(0, 10) : null,
      ...ref(a, { serviceAccountEmail: "" }),
    },
  };
}

export async function getGoogleAccounts(): Promise<GoogleAdsAccount[]> {
  const rows = await getDb().selectFrom("agency_ad_accounts").selectAll().where("platform", "=", "google").execute();
  return rows.map((r) => ({ customerId: r.external_id, name: r.name, currency: r.currency ?? "USD" }));
}
export async function getMetaAccounts(): Promise<MetaAdAccount[]> {
  const rows = await getDb().selectFrom("agency_ad_accounts").selectAll().where("platform", "=", "meta").execute();
  return rows.map((r) => ({ accountId: r.external_id, name: r.name, currency: r.currency ?? "USD" }));
}
export async function getGa4Properties(): Promise<Ga4Property[]> {
  const rows = await getDb().selectFrom("agency_ad_accounts").selectAll().where("platform", "=", "ga4").execute();
  return rows.map((r) => ({ propertyId: r.external_id, name: r.name, domain: r.domain ?? "" }));
}

export type BackfillStatus = "not_started" | "queued" | "running" | "complete";
export type ConnectionStatus = "connected" | "needs_reauth" | "not_connected";
export type BackfillSourceKey = "google" | "meta" | "ga4" | "store";
export const BACKFILL_SOURCES: BackfillSourceKey[] = ["google", "meta", "ga4", "store"];

/** ingest_jobs.source is the connector's own key ("google-ads"), not the shorter admin-UI key ("google"). */
const SOURCE_TO_INGEST: Record<BackfillSourceKey, string> = {
  google: "google-ads",
  meta: "meta",
  ga4: "ga4",
  store: "shopify", // resolved per-client to the actual store type when building the row
};
const CREDENTIAL_SOURCE: Record<BackfillSourceKey, string[]> = {
  google: ["google-ads"],
  meta: ["meta"],
  ga4: ["ga4"],
  store: ["shopify", "woo"],
};

export interface SourceBackfillState {
  status: BackfillStatus;
  range: { start: string; end: string } | null;
}

export interface StoreConnection {
  type: "shopify" | "woocommerce";
  domain: string;
  includedStatuses?: string[];
  status: ConnectionStatus;
}

export type ClientLifecycleStatus = "active" | "archived";

export interface AdminClient {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  createdAt: string;
  status: ClientLifecycleStatus;
  archivedAt: string | null;
  google: { customerId: string; name: string; status: ConnectionStatus } | null;
  meta: { accountId: string; name: string; status: ConnectionStatus } | null;
  ga4: { propertyId: string; name: string; status: ConnectionStatus } | null;
  store: StoreConnection | null;
  backfill: Record<BackfillSourceKey, SourceBackfillState>;
}

/** Whether a source has a live connection a backfill could actually pull from right now. */
export function isSourceConnected(client: AdminClient, source: BackfillSourceKey): boolean {
  switch (source) {
    case "google":
      return client.google?.status === "connected";
    case "meta":
      return client.meta?.status === "connected";
    case "ga4":
      return client.ga4?.status === "connected";
    case "store":
      return client.store?.status === "connected";
  }
}

/** Single-badge rollup for list views: worst-case status across sources that are actually connected. */
export function getClientBackfillSummary(client: AdminClient): BackfillStatus {
  const relevant = BACKFILL_SOURCES.filter((s) => isSourceConnected(client, s));
  if (relevant.length === 0) return "not_started";
  const statuses = relevant.map((s) => client.backfill[s].status);
  if (statuses.some((s) => s === "running")) return "running";
  if (statuses.some((s) => s === "queued")) return "queued";
  if (statuses.every((s) => s === "complete")) return "complete";
  return "not_started";
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  clientId: string | null;
  createdAt: string;
  passwordHash: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const connStatus = (status: "active" | "needs_reauth" | "disabled"): ConnectionStatus =>
  status === "active" ? "connected" : status === "needs_reauth" ? "needs_reauth" : "not_connected";

async function loadClients(clientIds?: string[]): Promise<AdminClient[]> {
  const db = getDb();
  let clientQuery = db.selectFrom("dim_client").selectAll();
  if (clientIds) clientQuery = clientQuery.where("client_id", "in", clientIds);
  const clientRows = await clientQuery.orderBy("created_at", "asc").execute();
  if (clientRows.length === 0) return [];
  const ids = clientRows.map((c) => c.client_id);

  const credRows = await db.selectFrom("client_credentials").selectAll().where("client_id", "in", ids).execute();
  const credsByClient = new Map<string, typeof credRows>();
  for (const r of credRows) {
    const list = credsByClient.get(r.client_id) ?? [];
    list.push(r);
    credsByClient.set(r.client_id, list);
  }

  const jobRows = await sql<{
    client_id: string;
    source: string;
    min_date: string;
    max_date: string;
    any_running: boolean;
    any_pending: boolean;
    all_succeeded: boolean;
  }>`
    select client_id, source, min(date)::text as min_date, max(date)::text as max_date,
      bool_or(status = 'running') as any_running,
      bool_or(status = 'pending') as any_pending,
      bool_and(status = 'succeeded') as all_succeeded
    from ingest_jobs
    where client_id = any(${ids}::uuid[]) and kind = 'backfill'
    group by client_id, source
  `.execute(db);
  const jobsByClient = new Map<string, typeof jobRows.rows>();
  for (const r of jobRows.rows) {
    const list = jobsByClient.get(r.client_id) ?? [];
    list.push(r);
    jobsByClient.set(r.client_id, list);
  }

  return clientRows.map((c) => {
    const creds = credsByClient.get(c.client_id) ?? [];
    const jobs = jobsByClient.get(c.client_id) ?? [];
    const findCred = (sources: string[]) => creds.find((cr) => sources.includes(cr.source));

    const googleCred = findCred(["google-ads"]);
    const metaCred = findCred(["meta"]);
    const ga4Cred = findCred(["ga4"]);
    const storeCred = findCred(["shopify", "woo"]);

    const googleConfig = googleCred?.config as { external_id: string; name: string } | undefined;
    const metaConfig = metaCred?.config as { external_id: string; name: string } | undefined;
    const ga4Config = ga4Cred?.config as { external_id: string; name: string } | undefined;
    const storeConfig = storeCred?.config as { domain: string; includedStatuses?: string[] } | undefined;

    const backfill = {} as Record<BackfillSourceKey, SourceBackfillState>;
    for (const key of BACKFILL_SOURCES) {
      const ingestSources = CREDENTIAL_SOURCE[key];
      const job = jobs.find((j) => ingestSources.includes(j.source));
      if (!job) {
        backfill[key] = { status: "not_started", range: null };
      } else {
        const status: BackfillStatus = job.any_running
          ? "running"
          : job.any_pending
            ? "queued"
            : job.all_succeeded
              ? "complete"
              : "queued";
        backfill[key] = { status, range: { start: job.min_date, end: job.max_date } };
      }
    }

    return {
      id: c.client_id,
      name: c.name,
      slug: c.slug,
      timezone: c.timezone,
      currency: c.currency,
      createdAt: String(c.created_at).slice(0, 10),
      status: c.status,
      archivedAt: c.archived_at ? String(c.archived_at).slice(0, 10) : null,
      google: googleCred && googleConfig ? { customerId: googleConfig.external_id, name: googleConfig.name, status: connStatus(googleCred.status) } : null,
      meta: metaCred && metaConfig ? { accountId: metaConfig.external_id, name: metaConfig.name, status: connStatus(metaCred.status) } : null,
      ga4: ga4Cred && ga4Config ? { propertyId: ga4Config.external_id, name: ga4Config.name, status: connStatus(ga4Cred.status) } : null,
      store:
        storeCred && storeConfig
          ? {
              type: storeCred.source === "shopify" ? "shopify" : "woocommerce",
              domain: storeConfig.domain,
              includedStatuses: storeConfig.includedStatuses,
              status: connStatus(storeCred.status),
            }
          : null,
      backfill,
    };
  });
}

export async function getClients(): Promise<AdminClient[]> {
  return loadClients();
}
export async function getClient(id: string): Promise<AdminClient | undefined> {
  if (!id) return undefined;
  const [client] = await loadClients([id]);
  return client;
}

export async function getUsers(): Promise<AdminUser[]> {
  const rows = await getDb().selectFrom("app_users").selectAll().orderBy("created_at", "asc").execute();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    clientId: r.client_id,
    createdAt: String(r.created_at).slice(0, 10),
    passwordHash: r.password_hash,
  }));
}
export async function getUser(id: string): Promise<AdminUser | undefined> {
  if (!id) return undefined;
  const r = await getDb().selectFrom("app_users").selectAll().where("id", "=", id).executeTakeFirst();
  if (!r) return undefined;
  return { id: r.id, name: r.name, email: r.email, role: r.role, clientId: r.client_id, createdAt: String(r.created_at).slice(0, 10), passwordHash: r.password_hash };
}
export async function findUserByEmail(email: string): Promise<AdminUser | undefined> {
  const normalized = email.trim().toLowerCase();
  const r = await getDb()
    .selectFrom("app_users")
    .selectAll()
    .where(sql<boolean>`lower(email) = ${normalized}`)
    .executeTakeFirst();
  if (!r) return undefined;
  return { id: r.id, name: r.name, email: r.email, role: r.role, clientId: r.client_id, createdAt: String(r.created_at).slice(0, 10), passwordHash: r.password_hash };
}

/** Accounts already linked to a client, keyed by id, so the wizard can flag them instead of allowing double assignment. */
export async function getAssignedAccountIds(): Promise<{ google: Set<string>; meta: Set<string>; ga4: Set<string> }> {
  const rows = await getDb().selectFrom("client_credentials").select(["source", "config"]).execute();
  const idOf = (r: (typeof rows)[number]) => (r.config as { external_id?: string } | null)?.external_id;
  return {
    google: new Set(rows.filter((r) => r.source === "google-ads").map(idOf).filter((v): v is string => !!v)),
    meta: new Set(rows.filter((r) => r.source === "meta").map(idOf).filter((v): v is string => !!v)),
    ga4: new Set(rows.filter((r) => r.source === "ga4").map(idOf).filter((v): v is string => !!v)),
  };
}

export interface NewClientInput {
  name: string;
  timezone: string;
  currency: string;
  googleCustomerId: string | null;
  metaAccountId: string | null;
  ga4PropertyId: string | null;
  store:
    | { type: "shopify"; domain: string }
    | { type: "woocommerce"; domain: string; includedStatuses: string[] }
    | null;
}

export async function createClientRecord(input: NewClientInput): Promise<AdminClient> {
  const db = getDb();
  const [googleAccounts, metaAccounts, ga4Properties] = await Promise.all([getGoogleAccounts(), getMetaAccounts(), getGa4Properties()]);
  const google = input.googleCustomerId ? googleAccounts.find((a) => a.customerId === input.googleCustomerId) : undefined;
  const meta = input.metaAccountId ? metaAccounts.find((a) => a.accountId === input.metaAccountId) : undefined;
  const ga4 = input.ga4PropertyId ? ga4Properties.find((p) => p.propertyId === input.ga4PropertyId) : undefined;

  const client = await db
    .insertInto("dim_client")
    .values({ name: input.name, slug: slugify(input.name), timezone: input.timezone, currency: input.currency })
    .returningAll()
    .executeTakeFirstOrThrow();

  const credentials: { client_id: string; source: "meta" | "google-ads" | "ga4" | "shopify" | "woo"; config: unknown; status: "active" }[] = [];
  if (google) credentials.push({ client_id: client.client_id, source: "google-ads", config: { external_id: google.customerId, name: google.name }, status: "active" });
  if (meta) credentials.push({ client_id: client.client_id, source: "meta", config: { external_id: meta.accountId, name: meta.name }, status: "active" });
  if (ga4) credentials.push({ client_id: client.client_id, source: "ga4", config: { external_id: ga4.propertyId, name: ga4.name }, status: "active" });
  if (input.store) {
    credentials.push({
      client_id: client.client_id,
      source: input.store.type === "shopify" ? "shopify" : "woo",
      config: input.store.type === "shopify" ? { domain: input.store.domain } : { domain: input.store.domain, includedStatuses: input.store.includedStatuses },
      status: "active",
    });
  }
  if (credentials.length > 0) {
    await db.insertInto("client_credentials").values(credentials).execute();
  }

  const record = await getClient(client.client_id);
  if (!record) throw new Error("Failed to load newly created client");
  return record;
}

/** Archived clients keep all their historical data but are skipped by the daily/backfill sync. Reversible. */
export async function archiveClient(clientId: string): Promise<void> {
  await getDb()
    .updateTable("dim_client")
    .set({ status: "archived", archived_at: new Date() })
    .where("client_id", "=", clientId)
    .execute();
}

export async function unarchiveClient(clientId: string): Promise<void> {
  await getDb()
    .updateTable("dim_client")
    .set({ status: "active", archived_at: null })
    .where("client_id", "=", clientId)
    .execute();
}

/**
 * Permanently purges a client and every row keyed to it (credentials,
 * ingest jobs, campaign map, all fact/mart tables, product data, and any
 * client-role app_users tied to it) via ON DELETE CASCADE from dim_client.
 * Irreversible: there is no soft-delete path back from this, unlike archive.
 */
export async function deleteClient(clientId: string): Promise<void> {
  await getDb().deleteFrom("dim_client").where("client_id", "=", clientId).execute();
}

/**
 * Queues a backfill for an explicit date range, one or more sources at a
 * time: one ingest_jobs row per day per source (matches jobs/src/backfill.ts,
 * which runs per source, one day at a time). Upserted so re-queuing a
 * previously completed/failed day resets it to pending. A source already
 * queued or running is skipped rather than failing the whole request.
 */
export async function startBackfill(
  clientId: string,
  sources: BackfillSourceKey[],
  range: { start: string; end: string },
): Promise<{ queued: BackfillSourceKey[]; blocked: BackfillSourceKey[] }> {
  const db = getDb();
  const client = await getClient(clientId);
  if (!client || client.status === "archived") return { queued: [], blocked: sources };

  const queued: BackfillSourceKey[] = [];
  const blocked: BackfillSourceKey[] = [];
  for (const key of sources) {
    const current = client.backfill[key].status;
    if (current === "queued" || current === "running") {
      blocked.push(key);
      continue;
    }
    const ingestSource =
      key === "store" ? (client.store?.type === "woocommerce" ? "woo" : "shopify") : SOURCE_TO_INGEST[key];
    await sql`
      insert into ingest_jobs (client_id, source, date, kind, status)
      select ${clientId}::uuid, ${ingestSource}, d, 'backfill', 'pending'
      from generate_series(${range.start}::date, ${range.end}::date, interval '1 day') d
      on conflict (client_id, source, date, kind)
      do update set status = 'pending', attempts = 0, last_error = null, started_at = null, finished_at = null
    `.execute(db);
    queued.push(key);
  }
  return { queued, blocked };
}

export async function createUserRecord(input: {
  name: string;
  email: string;
  role: Role;
  clientId: string | null;
  passwordHash: string;
}): Promise<AdminUser> {
  const r = await getDb()
    .insertInto("app_users")
    .values({
      name: input.name,
      email: input.email,
      role: input.role,
      client_id: input.role === "client" ? input.clientId : null,
      password_hash: input.passwordHash,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return { id: r.id, name: r.name, email: r.email, role: r.role, clientId: r.client_id, createdAt: String(r.created_at).slice(0, 10), passwordHash: r.password_hash };
}

export async function assignUserClient(userId: string, clientId: string | null): Promise<void> {
  await getDb().updateTable("app_users").set({ client_id: clientId }).where("id", "=", userId).where("role", "=", "client").execute();
}

export async function setUserPassword(userId: string, passwordHash: string): Promise<void> {
  await getDb().updateTable("app_users").set({ password_hash: passwordHash }).where("id", "=", userId).execute();
}

export async function removeUser(userId: string): Promise<void> {
  await getDb().deleteFrom("app_users").where("id", "=", userId).execute();
}
