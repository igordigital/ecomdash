-- Two more real, daily-reported metrics mock data modeled that fact_ad_daily
-- didn't carry yet: Meta's reach (frequency = impressions / reach, derived
-- at query time, not stored) and Google's search impression share (does not
-- apply to Performance Max, so nullable). campaign_type is a slow-changing
-- campaign attribute, not a daily fact, so it lives on dim_campaign_map.

alter table fact_ad_daily
  add column reach bigint,
  add column impression_share numeric(6, 4);

alter table dim_campaign_map
  add column campaign_type text check (campaign_type in ('Search', 'Performance Max', 'Shopping'));
