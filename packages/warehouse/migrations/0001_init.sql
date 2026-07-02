-- ecomdash warehouse: dimensions, facts, credentials, job queue support.
-- Single project, shared tables keyed by client_id, RLS by client (Decision D3).
-- Large fact tables are range-partitioned by month on the date column.

create extension if not exists pgcrypto;

-- Supabase provides the authenticated role; create it on plain Postgres
-- (local dev, CI service container) so RLS policies apply identically.
do $$
begin
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS helper: reads the client_id claim from the request JWT.
-- Works on Supabase (request.jwt.claims is set by PostgREST) and degrades to
-- NULL on plain Postgres (service/worker connections bypass RLS as table owner).
-- ---------------------------------------------------------------------------
create or replace function public.current_client_id() returns uuid
language sql stable as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'client_id',
      ''
    ),
    ''
  )::uuid
$$;

-- ---------------------------------------------------------------------------
-- Dimensions
-- ---------------------------------------------------------------------------
create table dim_client (
  client_id   uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  timezone    text not null default 'UTC',
  currency    text not null default 'USD',
  created_at  timestamptz not null default now()
);

create table dim_date (
  date_key    date primary key,
  dow         smallint not null,
  iso_week    smallint not null,
  month       smallint not null,
  quarter     smallint not null,
  year        smallint not null,
  is_weekend  boolean not null
);

insert into dim_date
select d::date,
       extract(isodow from d),
       extract(week from d),
       extract(month from d),
       extract(quarter from d),
       extract(year from d),
       extract(isodow from d) in (6, 7)
from generate_series('2023-01-01'::date, '2028-12-31'::date, interval '1 day') d;

-- Campaign crosswalk. Maps each platform campaign to a unified group and to
-- the utm_campaign string GA4 will report. Google side joins natively via
-- google_ads_campaign_id (GCLID link); Meta side is UTM-dependent and can
-- degrade per client (surface UTM match rate in the UI, not an error).
create table dim_campaign_map (
  campaign_key            uuid primary key default gen_random_uuid(),
  client_id               uuid not null references dim_client,
  platform                text not null check (platform in ('meta', 'google')),
  platform_campaign_id    text not null,
  platform_campaign_name  text not null,
  utm_campaign            text,
  utm_source              text,
  utm_medium              text,
  google_ads_campaign_id  text,
  active                  boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (client_id, platform, platform_campaign_id)
);

-- ---------------------------------------------------------------------------
-- Facts (restated daily; upsert-replace by grain; loaded_at on every row)
-- ---------------------------------------------------------------------------

-- Grain: platform x campaign x group x ad x date.
-- ad_id/'' convention: Google is campaign + ad_group at v1 (Decision D2), so
-- ad_id and ad_name are '' (empty), never NULL, because they are part of the PK.
-- platform_conversions / platform_conv_value are DIAGNOSTIC ONLY: never summed
-- across platforms, never a revenue total (Invariant 1).
create table fact_ad_daily (
  client_id             uuid not null references dim_client,
  date                  date not null,
  platform              text not null check (platform in ('meta', 'google')),
  campaign_id           text not null,
  campaign_name         text not null default '',
  adset_id              text not null,
  adset_name            text not null default '',
  ad_id                 text not null default '',
  ad_name               text not null default '',
  spend                 numeric(14, 4) not null default 0,
  impressions           bigint not null default 0,
  clicks                bigint not null default 0,
  platform_conversions  numeric(14, 4) not null default 0,
  platform_conv_value   numeric(14, 4) not null default 0,
  currency              text not null,
  attribution_window    text not null default '',
  loaded_at             timestamptz not null default now(),
  primary key (client_id, date, platform, campaign_id, adset_id, ad_id)
) partition by range (date);

-- Source of truth for revenue and orders (Invariant 1). Reconciled on a
-- trailing 30-day window for refunds, cancellations, and status changes.
create table fact_orders (
  client_id         uuid not null references dim_client,
  order_id          text not null,
  order_ts          timestamptz not null,
  order_date        date not null,          -- store timezone; drives MER alignment
  gross_revenue     numeric(14, 4) not null,
  discounts         numeric(14, 4) not null default 0,
  refunds           numeric(14, 4) not null default 0,
  net_revenue       numeric(14, 4) not null, -- gross - refunds; the MER numerator
  currency          text not null,
  item_count        integer not null default 0,
  customer_type     text check (customer_type in ('new', 'returning')),
  landing_site      text,
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  financial_status  text not null default '',
  loaded_at         timestamptz not null default now(),
  primary key (client_id, order_id)
);

create index fact_orders_by_date on fact_orders (client_id, order_date);

-- Paid-traffic validation at campaign level (GA4 is the referee).
-- ga4_conversions / ga4_revenue are DIAGNOSTIC ONLY.
create table fact_ga4_campaign (
  client_id              uuid not null references dim_client,
  date                   date not null,
  session_source_medium  text not null,
  session_campaign       text not null,
  device                 text not null,
  sessions               bigint not null default 0,
  engaged_sessions       bigint not null default 0,
  engagement_rate        numeric(8, 6) not null default 0,
  ga4_conversions        numeric(14, 4) not null default 0,
  ga4_revenue            numeric(14, 4) not null default 0,
  loaded_at              timestamptz not null default now(),
  primary key (client_id, date, session_source_medium, session_campaign, device)
) partition by range (date);

-- Site health; needs no crosswalk (build first as the quick win).
create table fact_ga4_traffic (
  client_id             uuid not null references dim_client,
  date                  date not null,
  channel_group         text not null,
  source_medium         text not null,
  sessions              bigint not null default 0,
  engaged_sessions      bigint not null default 0,
  engagement_rate       numeric(8, 6) not null default 0,
  avg_session_duration  numeric(12, 4) not null default 0,
  bounce_rate           numeric(8, 6) not null default 0,
  new_users             bigint not null default 0,
  total_users           bigint not null default 0,
  loaded_at             timestamptz not null default now(),
  primary key (client_id, date, channel_group, source_medium)
) partition by range (date);

-- ---------------------------------------------------------------------------
-- Monthly partition management (dependency-free; callable from the daily job)
-- ---------------------------------------------------------------------------
create or replace function public.ensure_month_partitions(
  parent_table text,
  from_month date,
  months int
) returns void language plpgsql as $$
declare
  m date;
  part_name text;
begin
  for i in 0 .. months - 1 loop
    m := date_trunc('month', from_month)::date + (i || ' months')::interval;
    part_name := parent_table || '_' || to_char(m, 'YYYY_MM');
    execute format(
      'create table if not exists %I partition of %I for values from (%L) to (%L)',
      part_name, parent_table, m, (m + interval '1 month')::date
    );
  end loop;
end;
$$;

select ensure_month_partitions('fact_ad_daily',     '2024-01-01', 48);
select ensure_month_partitions('fact_ga4_campaign', '2024-01-01', 48);
select ensure_month_partitions('fact_ga4_traffic',  '2024-01-01', 48);

-- ---------------------------------------------------------------------------
-- Credential vault. Secret material lives in Supabase Vault; this table holds
-- the vault reference plus non-secret config (account ids, shop domain, etc).
-- Never store tokens in plaintext or in the repo.
-- ---------------------------------------------------------------------------
create table client_credentials (
  client_id        uuid not null references dim_client,
  source           text not null check (source in ('meta', 'google-ads', 'ga4', 'shopify', 'woo')),
  vault_secret_id  uuid,            -- Supabase Vault secret reference
  config           jsonb not null default '{}'::jsonb,  -- non-secret: account ids, property id, shop domain
  status           text not null default 'active' check (status in ('active', 'needs_reauth', 'disabled')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (client_id, source)
);

-- ---------------------------------------------------------------------------
-- Ingestion job ledger: each (client, source, date) outcome, so backfill is
-- resumable and a day's last movement is auditable.
-- ---------------------------------------------------------------------------
create table ingest_jobs (
  id           bigint generated always as identity primary key,
  client_id    uuid not null references dim_client,
  source       text not null,
  date         date not null,
  kind         text not null check (kind in ('backfill', 'daily')),
  status       text not null default 'pending'
               check (status in ('pending', 'running', 'succeeded', 'failed')),
  attempts     integer not null default 0,
  last_error   text,
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (client_id, source, date, kind)
);

-- ---------------------------------------------------------------------------
-- Row-level security: every client-keyed table, scoped by JWT claim.
-- The worker connects as the table owner / service role and bypasses RLS.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'dim_client', 'dim_campaign_map',
    'fact_ad_daily', 'fact_orders', 'fact_ga4_campaign', 'fact_ga4_traffic',
    'client_credentials', 'ingest_jobs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy client_read on %I for select to authenticated using (client_id = public.current_client_id())',
      t
    );
  end loop;
end;
$$;
