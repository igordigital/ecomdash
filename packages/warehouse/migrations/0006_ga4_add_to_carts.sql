-- Add-to-cart counts alongside sessions/engagement on every GA4 report
-- shape, so "add to cart" is visible at the channel, campaign, and content
-- (ad) grain, not just as a separate funnel step.

alter table fact_ga4_traffic add column add_to_carts bigint not null default 0;
alter table fact_ga4_campaign add column add_to_carts bigint not null default 0;
alter table fact_ga4_content add column add_to_carts bigint not null default 0;
