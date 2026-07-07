import pg from "pg";

/**
 * Seeds demo clients, their platform connections, and app users into
 * Supabase, with deliberately NO fact data: the connectors don't exist yet,
 * so the dashboard should honestly show empty/zero states for these clients
 * until the real pipeline lands. This replaces the old in-memory
 * SEED_CLIENTS/SEED_USERS arrays that used to live in lib/admin-store.ts.
 *
 * Idempotent: safe to re-run, upserts by natural key (slug / email /
 * platform / external_id).
 */

const encoder = new TextEncoder();
const PBKDF2_ITERATIONS = 120_000;

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Same algorithm as apps/web/lib/auth.ts hashPassword, duplicated here since this script has no dependency on the web app. */
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return `${toHex(salt)}:${toHex(bits)}`;
}

const DEMO_PASSWORD = "ecomdash-demo";

interface SeedClient {
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  google: { externalId: string; name: string; status: "active" | "needs_reauth" } | null;
  meta: { externalId: string; name: string; status: "active" | "needs_reauth" } | null;
  ga4: { externalId: string; name: string } | null;
  store: { source: "shopify" | "woo"; domain: string; includedStatuses?: string[] } | null;
}

const CLIENTS: SeedClient[] = [
  {
    name: "Acme Outdoors",
    slug: "acme-outdoors",
    timezone: "America/Denver",
    currency: "USD",
    google: { externalId: "412-556-7890", name: "Acme Outdoors", status: "active" },
    meta: { externalId: "act_10897234561", name: "Acme Outdoors", status: "active" },
    ga4: { externalId: "properties/348219004", name: "Acme Outdoors — Production" },
    store: { source: "shopify", domain: "acme-outdoors.myshopify.com" },
  },
  {
    name: "Northwind Coffee Co.",
    slug: "northwind-coffee-co",
    timezone: "America/New_York",
    currency: "USD",
    google: { externalId: "556-223-1147", name: "Northwind Coffee Co.", status: "active" },
    meta: { externalId: "act_10897234782", name: "Northwind Coffee Co.", status: "needs_reauth" },
    ga4: { externalId: "properties/348219115", name: "Northwind Coffee — Production" },
    store: { source: "woo", domain: "northwindcoffee.co", includedStatuses: ["completed", "processing"] },
  },
  {
    name: "Solstice Skincare",
    slug: "solstice-skincare",
    timezone: "America/Los_Angeles",
    currency: "USD",
    google: { externalId: "778-902-3345", name: "Solstice Skincare", status: "active" },
    meta: { externalId: "act_10897235014", name: "Solstice Skincare", status: "active" },
    ga4: null,
    store: { source: "shopify", domain: "solstice-skincare.myshopify.com" },
  },
  {
    name: "Harbor & Pine Furniture",
    slug: "harbor-pine-furniture",
    timezone: "America/Toronto",
    currency: "CAD",
    google: null,
    meta: { externalId: "act_10897235339", name: "Harbor & Pine Furniture", status: "active" },
    ga4: { externalId: "properties/348219337", name: "Harbor & Pine — Production" },
    store: null,
  },
];

const AGENCY_AD_ACCOUNTS: { platform: "meta" | "google" | "ga4"; externalId: string; name: string; currency: string | null; domain: string | null }[] = [
  { platform: "google", externalId: "412-556-7890", name: "Acme Outdoors", currency: "USD", domain: null },
  { platform: "google", externalId: "556-223-1147", name: "Northwind Coffee Co.", currency: "USD", domain: null },
  { platform: "google", externalId: "778-902-3345", name: "Solstice Skincare", currency: "USD", domain: null },
  { platform: "google", externalId: "334-118-6620", name: "Harbor & Pine Furniture", currency: "CAD", domain: null },
  { platform: "google", externalId: "990-441-2287", name: "Lumen Athletics", currency: "USD", domain: null },
  { platform: "meta", externalId: "act_10897234561", name: "Acme Outdoors", currency: "USD", domain: null },
  { platform: "meta", externalId: "act_10897234782", name: "Northwind Coffee Co.", currency: "USD", domain: null },
  { platform: "meta", externalId: "act_10897235014", name: "Solstice Skincare", currency: "USD", domain: null },
  { platform: "meta", externalId: "act_10897235339", name: "Harbor & Pine Furniture", currency: "CAD", domain: null },
  { platform: "meta", externalId: "act_10897235601", name: "Lumen Athletics", currency: "USD", domain: null },
  { platform: "ga4", externalId: "properties/348219004", name: "Acme Outdoors — Production", currency: null, domain: "acmeoutdoors.com" },
  { platform: "ga4", externalId: "properties/348219115", name: "Northwind Coffee — Production", currency: null, domain: "northwindcoffee.co" },
  { platform: "ga4", externalId: "properties/348219226", name: "Solstice Skincare — Production", currency: null, domain: "solsticeskincare.com" },
  { platform: "ga4", externalId: "properties/348219337", name: "Harbor & Pine — Production", currency: null, domain: "harborandpine.ca" },
  { platform: "ga4", externalId: "properties/348219448", name: "Lumen Athletics — Production", currency: null, domain: "lumenathletics.com" },
];

interface SeedUser {
  name: string;
  email: string;
  role: "admin" | "analyst" | "client";
  clientSlug: string | null;
}

const USERS: SeedUser[] = [
  { name: "Igor Zvagelsky", email: "i@igor.digital", role: "admin", clientSlug: null },
  { name: "Dana Whitfield", email: "dana@ecomdash.agency", role: "analyst", clientSlug: null },
  { name: "Marcus Ide", email: "marcus@ecomdash.agency", role: "analyst", clientSlug: null },
  { name: "Priya Nandakumar", email: "priya@acmeoutdoors.com", role: "client", clientSlug: "acme-outdoors" },
  { name: "Tom Rutherford", email: "tom@northwindcoffee.co", role: "client", clientSlug: "northwind-coffee-co" },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    console.log("seeding agency_integrations");
    await client.query(
      `insert into agency_integrations (platform, connected, external_ref, connected_at)
       values
         ('google', true, $1, '2026-06-02'),
         ('meta', true, $2, '2026-06-02'),
         ('ga4', true, $3, '2026-06-03')
       on conflict (platform) do update set connected = excluded.connected, external_ref = excluded.external_ref, connected_at = excluded.connected_at`,
      [
        JSON.stringify({ mccId: "123-456-7890", developerTokenStatus: "approved" }),
        JSON.stringify({ businessManagerId: "987654321012345", businessManagerName: "Acme Media Group" }),
        JSON.stringify({ serviceAccountEmail: "ecomdash-ga4-reader@ecomdash-prod.iam.gserviceaccount.com" }),
      ],
    );

    console.log("seeding agency_ad_accounts");
    for (const a of AGENCY_AD_ACCOUNTS) {
      await client.query(
        `insert into agency_ad_accounts (platform, external_id, name, currency, domain)
         values ($1, $2, $3, $4, $5)
         on conflict (platform, external_id) do update set name = excluded.name, currency = excluded.currency, domain = excluded.domain`,
        [a.platform, a.externalId, a.name, a.currency, a.domain],
      );
    }

    console.log("seeding dim_client + client_credentials");
    const clientIdBySlug = new Map<string, string>();
    for (const c of CLIENTS) {
      const { rows } = await client.query<{ client_id: string }>(
        `insert into dim_client (name, slug, timezone, currency)
         values ($1, $2, $3, $4)
         on conflict (slug) do update set name = excluded.name, timezone = excluded.timezone, currency = excluded.currency
         returning client_id`,
        [c.name, c.slug, c.timezone, c.currency],
      );
      const clientId = rows[0]!.client_id;
      clientIdBySlug.set(c.slug, clientId);

      const creds: { source: string; config: object; status: string }[] = [];
      if (c.google) creds.push({ source: "google-ads", config: { external_id: c.google.externalId, name: c.google.name }, status: c.google.status });
      if (c.meta) creds.push({ source: "meta", config: { external_id: c.meta.externalId, name: c.meta.name }, status: c.meta.status });
      if (c.ga4) creds.push({ source: "ga4", config: { external_id: c.ga4.externalId, name: c.ga4.name }, status: "active" });
      if (c.store) creds.push({ source: c.store.source, config: { domain: c.store.domain, includedStatuses: c.store.includedStatuses }, status: "active" });

      for (const cred of creds) {
        await client.query(
          `insert into client_credentials (client_id, source, config, status)
           values ($1, $2, $3, $4)
           on conflict (client_id, source) do update set config = excluded.config, status = excluded.status`,
          [clientId, cred.source, JSON.stringify(cred.config), cred.status],
        );
      }
    }

    console.log("seeding app_users");
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    for (const u of USERS) {
      const clientId = u.clientSlug ? clientIdBySlug.get(u.clientSlug) : null;
      await client.query(
        `insert into app_users (name, email, role, client_id, password_hash)
         values ($1, $2, $3, $4, $5)
         on conflict (email) do update set name = excluded.name, role = excluded.role, client_id = excluded.client_id`,
        [u.name, u.email, u.role, clientId, passwordHash],
      );
    }

    console.log("seed complete");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
