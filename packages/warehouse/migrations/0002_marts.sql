-- Marts: what the dashboard reads. The dashboard never scans raw or fact
-- tables at request time. Rebuilt after every daily refresh.

-- MER = store_net_revenue / total_ad_spend_across_platforms (Invariant 2).
-- MER credits all revenue (including organic/email/direct) to paid spend;
-- this is intentional and must be labeled as such in the UI.
create table mart_mer_rolling (
  client_id                 uuid not null references dim_client,
  date                      date not null,
  "window"                  text not null check ("window" in ('7d', '28d')),
  total_spend_window        numeric(14, 4) not null,
  store_net_revenue_window  numeric(14, 4) not null,
  mer                       numeric(14, 6),   -- NULL when spend is 0
  loaded_at                 timestamptz not null default now(),
  primary key (client_id, date, "window")
);

-- Per campaign x day. platform_roas is DIAGNOSTIC ONLY
-- (platform_conv_value / spend); GA4 columns join via crosswalk where available.
create table mart_campaign_health (
  client_id            uuid not null references dim_client,
  date                 date not null,
  platform             text not null check (platform in ('meta', 'google')),
  campaign_key         uuid not null references dim_campaign_map,
  spend                numeric(14, 4) not null default 0,
  impressions          bigint not null default 0,
  clicks               bigint not null default 0,
  platform_roas        numeric(14, 6),
  ga4_sessions         bigint,
  ga4_engagement_rate  numeric(8, 6),
  loaded_at            timestamptz not null default now(),
  primary key (client_id, date, platform, campaign_key)
);

-- Anomaly flags feeding the dashboard panel. Ranked by absolute impact,
-- not percentage. narrative is the stored Claude-generated note (plain,
-- direct language; generated post-rebuild, never at request time).
create table mart_anomalies (
  id           bigint generated always as identity primary key,
  client_id    uuid not null references dim_client,
  date         date not null,
  kind         text not null check (kind in ('spend_swing', 'mer_move', 'conv_rate_drop')),
  scope        jsonb not null default '{}'::jsonb,  -- campaign/platform the flag points at
  impact_abs   numeric(14, 4) not null,             -- absolute spend/revenue impact for ranking
  narrative    text,
  loaded_at    timestamptz not null default now()
);

create index mart_anomalies_by_day on mart_anomalies (client_id, date desc, impact_abs desc);

do $$
declare t text;
begin
  foreach t in array array['mart_mer_rolling', 'mart_campaign_health', 'mart_anomalies'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy client_read on %I for select to authenticated using (client_id = public.current_client_id())',
      t
    );
  end loop;
end;
$$;
