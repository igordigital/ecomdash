/**
 * Admin panel demo store. In-memory only: mutations from Server Actions
 * persist for the life of this dev server process, then reset. Stands in
 * for what will be dim_client, client_credentials, and a users/roles table
 * once the pipeline and real auth land.
 *
 * The point being demonstrated: Meta, Google Ads, and GA4 are authorized
 * ONCE at the agency level (system user token, MCC refresh token, shared
 * service account). Assigning a client to a platform is then just picking
 * an already-visible account/property, never a new OAuth flow. Shopify and
 * WooCommerce cannot be pre-authorized this way (each store has its own
 * owner), so they keep a per-client connect step.
 */

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

export const AGENCY_INTEGRATIONS = {
  google: {
    connected: true,
    mccId: "123-456-7890",
    developerTokenStatus: "approved" as const, // real-world: pending Basic access approval
    connectedAt: "2026-06-02",
  },
  meta: {
    connected: true,
    businessManagerId: "987654321012345",
    businessManagerName: "Acme Media Group",
    connectedAt: "2026-06-02",
  },
  ga4: {
    connected: true,
    serviceAccountEmail: "ecomdash-ga4-reader@ecomdash-prod.iam.gserviceaccount.com",
    connectedAt: "2026-06-03",
  },
};

const GOOGLE_ACCOUNTS: GoogleAdsAccount[] = [
  { customerId: "412-556-7890", name: "Acme Outdoors", currency: "USD" },
  { customerId: "556-223-1147", name: "Northwind Coffee Co.", currency: "USD" },
  { customerId: "778-902-3345", name: "Solstice Skincare", currency: "USD" },
  { customerId: "334-118-6620", name: "Harbor & Pine Furniture", currency: "CAD" },
  { customerId: "990-441-2287", name: "Lumen Athletics", currency: "USD" },
];

const META_ACCOUNTS: MetaAdAccount[] = [
  { accountId: "act_10897234561", name: "Acme Outdoors", currency: "USD" },
  { accountId: "act_10897234782", name: "Northwind Coffee Co.", currency: "USD" },
  { accountId: "act_10897235014", name: "Solstice Skincare", currency: "USD" },
  { accountId: "act_10897235339", name: "Harbor & Pine Furniture", currency: "CAD" },
  { accountId: "act_10897235601", name: "Lumen Athletics", currency: "USD" },
];

const GA4_PROPERTIES: Ga4Property[] = [
  { propertyId: "properties/348219004", name: "Acme Outdoors — Production", domain: "acmeoutdoors.com" },
  { propertyId: "properties/348219115", name: "Northwind Coffee — Production", domain: "northwindcoffee.co" },
  { propertyId: "properties/348219226", name: "Solstice Skincare — Production", domain: "solsticeskincare.com" },
  { propertyId: "properties/348219337", name: "Harbor & Pine — Production", domain: "harborandpine.ca" },
  { propertyId: "properties/348219448", name: "Lumen Athletics — Production", domain: "lumenathletics.com" },
];

export function getGoogleAccounts(): GoogleAdsAccount[] {
  return GOOGLE_ACCOUNTS;
}
export function getMetaAccounts(): MetaAdAccount[] {
  return META_ACCOUNTS;
}
export function getGa4Properties(): Ga4Property[] {
  return GA4_PROPERTIES;
}

export type BackfillStatus = "not_started" | "queued" | "running" | "complete";
export type ConnectionStatus = "connected" | "needs_reauth" | "not_connected";
export type BackfillSourceKey = "google" | "meta" | "ga4" | "store";
export const BACKFILL_SOURCES: BackfillSourceKey[] = ["google", "meta", "ga4", "store"];

export interface SourceBackfillState {
  status: BackfillStatus;
  /** Date range of the most recently requested or completed backfill for this source, inclusive. */
  range: { start: string; end: string } | null;
}

export interface StoreConnection {
  type: "shopify" | "woocommerce";
  domain: string;
  includedStatuses?: string[]; // WooCommerce only
  status: ConnectionStatus;
}

export interface AdminClient {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  createdAt: string;
  google: { customerId: string; name: string; status: ConnectionStatus } | null;
  meta: { accountId: string; name: string; status: ConnectionStatus } | null;
  ga4: { propertyId: string; name: string; status: ConnectionStatus } | null;
  store: StoreConnection | null;
  /** Backfill runs one day at a time per source (see jobs/src/backfill.ts), so status and range are tracked per source, not blended into one client-level field. */
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
  clientId: string | null; // set only for role === "client"
  createdAt: string;
  passwordHash: string;
}

/**
 * PBKDF2 hash (see lib/auth.ts) of the shared demo password "ecomdash-demo".
 * Every seed account below logs in with this password, reusing one
 * precomputed hash for convenience; users created later via the invite
 * form each get their own freshly salted hash from a real password.
 */
const SEED_PASSWORD_HASH =
  "30f7020eac5ef97ac66f36beec3ba70c:f2fec39016290b4b8b8108c363238bb5229c2d61a6e21252393e113d97088b49";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const SEED_CLIENTS: AdminClient[] = [
  {
    id: "c-1",
    name: "Acme Outdoors",
    slug: "acme-outdoors",
    timezone: "America/Denver",
    currency: "USD",
    createdAt: "2026-06-05",
    google: { customerId: "412-556-7890", name: "Acme Outdoors", status: "connected" },
    meta: { accountId: "act_10897234561", name: "Acme Outdoors", status: "connected" },
    ga4: { propertyId: "properties/348219004", name: "Acme Outdoors — Production", status: "connected" },
    store: { type: "shopify", domain: "acme-outdoors.myshopify.com", status: "connected" },
    backfill: {
      google: { status: "complete", range: { start: "2026-03-08", end: "2026-06-05" } },
      meta: { status: "complete", range: { start: "2026-03-08", end: "2026-06-05" } },
      ga4: { status: "complete", range: { start: "2026-03-08", end: "2026-06-05" } },
      store: { status: "complete", range: { start: "2026-03-08", end: "2026-06-05" } },
    },
  },
  {
    id: "c-2",
    name: "Northwind Coffee Co.",
    slug: "northwind-coffee-co",
    timezone: "America/New_York",
    currency: "USD",
    createdAt: "2026-06-18",
    google: { customerId: "556-223-1147", name: "Northwind Coffee Co.", status: "connected" },
    meta: { accountId: "act_10897234782", name: "Northwind Coffee Co.", status: "needs_reauth" },
    ga4: { propertyId: "properties/348219115", name: "Northwind Coffee — Production", status: "connected" },
    store: {
      type: "woocommerce",
      domain: "northwindcoffee.co",
      includedStatuses: ["completed", "processing"],
      status: "connected",
    },
    backfill: {
      google: { status: "complete", range: { start: "2026-03-21", end: "2026-06-18" } },
      meta: { status: "complete", range: { start: "2026-03-21", end: "2026-06-18" } },
      ga4: { status: "complete", range: { start: "2026-03-21", end: "2026-06-18" } },
      store: { status: "complete", range: { start: "2026-03-21", end: "2026-06-18" } },
    },
  },
  {
    id: "c-3",
    name: "Solstice Skincare",
    slug: "solstice-skincare",
    timezone: "America/Los_Angeles",
    currency: "USD",
    createdAt: "2026-06-29",
    google: { customerId: "778-902-3345", name: "Solstice Skincare", status: "connected" },
    meta: { accountId: "act_10897235014", name: "Solstice Skincare", status: "connected" },
    ga4: null,
    store: { type: "shopify", domain: "solstice-skincare.myshopify.com", status: "connected" },
    backfill: {
      google: { status: "running", range: { start: "2026-04-01", end: "2026-06-29" } },
      meta: { status: "running", range: { start: "2026-04-01", end: "2026-06-29" } },
      ga4: { status: "not_started", range: null },
      store: { status: "running", range: { start: "2026-04-01", end: "2026-06-29" } },
    },
  },
  {
    id: "c-4",
    name: "Harbor & Pine Furniture",
    slug: "harbor-pine-furniture",
    timezone: "America/Toronto",
    currency: "CAD",
    createdAt: "2026-07-01",
    google: null,
    meta: { accountId: "act_10897235339", name: "Harbor & Pine Furniture", status: "connected" },
    ga4: { propertyId: "properties/348219337", name: "Harbor & Pine — Production", status: "connected" },
    store: null,
    backfill: {
      google: { status: "not_started", range: null },
      meta: { status: "not_started", range: null },
      ga4: { status: "not_started", range: null },
      store: { status: "not_started", range: null },
    },
  },
];

const SEED_USERS: AdminUser[] = [
  { id: "u-1", name: "Igor Zvagelsky", email: "i@igor.digital", role: "admin", clientId: null, createdAt: "2026-06-01", passwordHash: SEED_PASSWORD_HASH },
  { id: "u-2", name: "Dana Whitfield", email: "dana@ecomdash.agency", role: "analyst", clientId: null, createdAt: "2026-06-04", passwordHash: SEED_PASSWORD_HASH },
  { id: "u-3", name: "Marcus Ide", email: "marcus@ecomdash.agency", role: "analyst", clientId: null, createdAt: "2026-06-10", passwordHash: SEED_PASSWORD_HASH },
  { id: "u-4", name: "Priya Nandakumar", email: "priya@acmeoutdoors.com", role: "client", clientId: "c-1", createdAt: "2026-06-06", passwordHash: SEED_PASSWORD_HASH },
  { id: "u-5", name: "Tom Rutherford", email: "tom@northwindcoffee.co", role: "client", clientId: "c-2", createdAt: "2026-06-19", passwordHash: SEED_PASSWORD_HASH },
];

/**
 * Next.js dev (and even prod) can instantiate this module separately for
 * Server Actions vs Server Component rendering ("layers" in the RSC build
 * graph), so a plain module-level array does not reliably persist writes
 * across them. globalThis is the one thing guaranteed to be the same
 * object within a single Node process regardless of module layering; this
 * is the standard workaround (same pattern used for Prisma client
 * singletons in Next.js apps).
 */
interface Store {
  clients: AdminClient[];
  users: AdminUser[];
  nextClientSeq: number;
  nextUserSeq: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __ecomdashAdminStore: Store | undefined;
}

function store(): Store {
  if (!globalThis.__ecomdashAdminStore) {
    globalThis.__ecomdashAdminStore = {
      clients: SEED_CLIENTS.map((c) => ({ ...c })),
      users: SEED_USERS.map((u) => ({ ...u })),
      nextClientSeq: 6,
      nextUserSeq: 6,
    };
  }
  return globalThis.__ecomdashAdminStore;
}

export function getClients(): AdminClient[] {
  return store().clients;
}
export function getClient(id: string): AdminClient | undefined {
  return store().clients.find((c) => c.id === id);
}
export function getUsers(): AdminUser[] {
  return store().users;
}
export function getUser(id: string): AdminUser | undefined {
  return store().users.find((u) => u.id === id);
}
export function findUserByEmail(email: string): AdminUser | undefined {
  const normalized = email.trim().toLowerCase();
  return store().users.find((u) => u.email.toLowerCase() === normalized);
}

/** Accounts already linked to a client, keyed by id, so the wizard can flag them instead of allowing double assignment. */
export function getAssignedAccountIds(): { google: Set<string>; meta: Set<string>; ga4: Set<string> } {
  const { clients } = store();
  return {
    google: new Set(clients.map((c) => c.google?.customerId).filter((v): v is string => !!v)),
    meta: new Set(clients.map((c) => c.meta?.accountId).filter((v): v is string => !!v)),
    ga4: new Set(clients.map((c) => c.ga4?.propertyId).filter((v): v is string => !!v)),
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

export function createClientRecord(input: NewClientInput): AdminClient {
  const s = store();
  const google = input.googleCustomerId
    ? GOOGLE_ACCOUNTS.find((a) => a.customerId === input.googleCustomerId)
    : undefined;
  const meta = input.metaAccountId ? META_ACCOUNTS.find((a) => a.accountId === input.metaAccountId) : undefined;
  const ga4 = input.ga4PropertyId ? GA4_PROPERTIES.find((p) => p.propertyId === input.ga4PropertyId) : undefined;

  const record: AdminClient = {
    id: `c-${s.nextClientSeq++}`,
    name: input.name,
    slug: slugify(input.name),
    timezone: input.timezone,
    currency: input.currency,
    createdAt: new Date().toISOString().slice(0, 10),
    google: google ? { customerId: google.customerId, name: google.name, status: "connected" } : null,
    meta: meta ? { accountId: meta.accountId, name: meta.name, status: "connected" } : null,
    ga4: ga4 ? { propertyId: ga4.propertyId, name: ga4.name, status: "connected" } : null,
    store: input.store
      ? {
          type: input.store.type,
          domain: input.store.domain,
          includedStatuses: input.store.type === "woocommerce" ? input.store.includedStatuses : undefined,
          status: "connected",
        }
      : null,
    backfill: {
      google: { status: "not_started", range: null },
      meta: { status: "not_started", range: null },
      ga4: { status: "not_started", range: null },
      store: { status: "not_started", range: null },
    },
  };
  s.clients.push(record);
  return record;
}

/**
 * Queues a backfill for an explicit date range, one or more sources at a
 * time (matches jobs/src/backfill.ts, which runs per source). Each
 * requested source is queued independently; a source already queued or
 * running is skipped rather than failing the whole request, so selecting
 * "Google + GA4" while Meta is mid-run still queues the other two. A
 * source that finished a previous run can be re-queued for a new window.
 */
export function startBackfill(
  clientId: string,
  sources: BackfillSourceKey[],
  range: { start: string; end: string },
): { queued: BackfillSourceKey[]; blocked: BackfillSourceKey[] } {
  const c = store().clients.find((c) => c.id === clientId);
  if (!c) return { queued: [], blocked: sources };
  const queued: BackfillSourceKey[] = [];
  const blocked: BackfillSourceKey[] = [];
  for (const s of sources) {
    const current = c.backfill[s];
    if (current.status === "queued" || current.status === "running") {
      blocked.push(s);
      continue;
    }
    c.backfill[s] = { status: "queued", range };
    queued.push(s);
  }
  return { queued, blocked };
}

export function createUserRecord(input: {
  name: string;
  email: string;
  role: Role;
  clientId: string | null;
  passwordHash: string;
}): AdminUser {
  const s = store();
  const record: AdminUser = {
    id: `u-${s.nextUserSeq++}`,
    name: input.name,
    email: input.email,
    role: input.role,
    clientId: input.role === "client" ? input.clientId : null,
    createdAt: new Date().toISOString().slice(0, 10),
    passwordHash: input.passwordHash,
  };
  s.users.push(record);
  return record;
}

export function assignUserClient(userId: string, clientId: string | null): void {
  const u = store().users.find((u) => u.id === userId);
  if (u && u.role === "client") u.clientId = clientId;
}

export function setUserPassword(userId: string, passwordHash: string): void {
  const u = store().users.find((u) => u.id === userId);
  if (u) u.passwordHash = passwordHash;
}

export function removeUser(userId: string): void {
  const s = store();
  const idx = s.users.findIndex((u) => u.id === userId);
  if (idx >= 0) s.users.splice(idx, 1);
}
