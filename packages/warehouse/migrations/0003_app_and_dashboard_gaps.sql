-- App control-plane tables (users, agency-level integrations) and the
-- dashboard fact/dimension gaps mock data covered but the v1 schema didn't:
-- product-level order lines, GA4 ecommerce funnel events, and GA4 content
-- (ad-level) traffic. Existing tables are reused wherever the shape already
-- fits: client_credentials for per-client platform connection state,
-- ingest_jobs for per-source backfill history, mart_* for MER/anomalies.

-- ---------------------------------------------------------------------------
-- App users: real accounts for the login gate (replaces the in-memory
-- SEED_USERS array). Not client-keyed data itself, so no RLS policy here;
-- the app queries this with the service-role connection only.
-- ---------------------------------------------------------------------------
create table app_users (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null unique,
  role          text not null check (role in ('admin', 'analyst', 'client')),
  client_id     uuid references dim_client,
  password_hash text not null,
  created_at    timestamptz not null default now(),
  check (role = 'client' or client_id is null)
);

-- ---------------------------------------------------------------------------
-- Agency-level platform authorization (Meta Business Manager, Google MCC,
-- GA4 service account) plus the ad accounts/properties visible under each,
-- so a client can be assigned an already-authorized account instead of
-- running OAuth per client. Populated by a real account-listing sync once
-- API credentials exist; seeded by hand until then.
-- ---------------------------------------------------------------------------
create table agency_integrations (
  platform      text primary key check (platform in ('meta', 'google', 'ga4')),
  connected     boolean not null default false,
  external_ref  jsonb not null default '{}'::jsonb,
  connected_at  timestamptz
);

create table agency_ad_accounts (
  platform     text not null check (platform in ('meta', 'google', 'ga4')),
  external_id  text not null,
  name         text not null,
  currency     text,
  domain       text,
  primary key (platform, external_id)
);

-- ---------------------------------------------------------------------------
-- Product-level order lines (top products) and a lightweight product
-- dimension for stock status, both absent from the v1 order-grain schema.
-- ---------------------------------------------------------------------------
create table dim_product (
  client_id     uuid not null references dim_client,
  sku           text not null,
  name          text not null,
  price         numeric(14, 4),
  stock_status  text check (stock_status in ('in_stock', 'low_stock', 'out_of_stock')),
  updated_at    timestamptz not null default now(),
  primary key (client_id, sku)
);

create table fact_order_items (
  client_id     uuid not null references dim_client,
  order_id      text not null,
  order_date    date not null,
  sku           text not null,
  product_name  text not null,
  units         integer not null default 0,
  revenue       numeric(14, 4) not null default 0,
  loaded_at     timestamptz not null default now(),
  primary key (client_id, order_id, sku)
);

create index fact_order_items_by_date on fact_order_items (client_id, order_date);

-- ---------------------------------------------------------------------------
-- GA4 ecommerce funnel (site-wide add-to-cart/checkout event counts per day).
-- Sessions come from fact_ga4_traffic, orders from fact_orders; this table
-- fills the two steps in between.
-- ---------------------------------------------------------------------------
create table fact_ga4_funnel (
  client_id     uuid not null references dim_client,
  date          date not null,
  add_to_carts  bigint not null default 0,
  checkouts     bigint not null default 0,
  loaded_at     timestamptz not null default now(),
  primary key (client_id, date)
);

-- ---------------------------------------------------------------------------
-- GA4 content (ad-level, utm_content) traffic. Sits below fact_ga4_campaign
-- in the crosswalk: a content row can only exist where the parent campaign
-- already matched (Decision: content tags are a sub-dimension of the
-- campaign tag). ga4_conversions/ga4_revenue are DIAGNOSTIC ONLY, same as
-- fact_ga4_campaign.
-- ---------------------------------------------------------------------------
create table fact_ga4_content (
  client_id              uuid not null references dim_client,
  date                   date not null,
  session_source_medium  text not null,
  session_campaign       text not null,
  session_ad_content     text not null,
  sessions               bigint not null default 0,
  engaged_sessions       bigint not null default 0,
  engagement_rate        numeric(8, 6) not null default 0,
  ga4_conversions        numeric(14, 4) not null default 0,
  ga4_revenue            numeric(14, 4) not null default 0,
  loaded_at              timestamptz not null default now(),
  primary key (client_id, date, session_source_medium, session_campaign, session_ad_content)
);

-- ---------------------------------------------------------------------------
-- Platform-reported funnel actions and creative tagging, both absent from
-- the v1 fact_ad_daily grain. Nullable: Google's account-level funnel
-- actions aren't reported the same way as Meta's, and creative_type is
-- assigned by a later tagging step, not by the raw platform pull.
-- ---------------------------------------------------------------------------
alter table fact_ad_daily
  add column creative_type text check (creative_type in ('UGC video', 'Brand video', 'Static', 'Carousel', 'DPA')),
  add column atc bigint,
  add column checkouts_initiated bigint;

-- ---------------------------------------------------------------------------
-- RLS: app_users, agency_integrations, agency_ad_accounts are control-plane
-- tables the app queries only via the service-role connection (never a
-- per-client JWT), so they intentionally have no client_read policy. The new
-- client-keyed tables get the same policy as the rest of the warehouse.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['dim_product', 'fact_order_items', 'fact_ga4_funnel', 'fact_ga4_content'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy client_read on %I for select to authenticated using (client_id = public.current_client_id())',
      t
    );
  end loop;
end;
$$;
