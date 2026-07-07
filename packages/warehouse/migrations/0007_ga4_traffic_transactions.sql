-- Ecommerce transaction count at the channel grain, for the Channels table's
-- Transactions column (previously only available at campaign/content grain).

alter table fact_ga4_traffic add column transactions bigint not null default 0;
