-- Optional flat recurring monthly ad-spend budget per client. Null means no
-- budget has been set; the dashboard's Run rate section only shows budget
-- usage for clients that have one. Applies to every month until changed --
-- no per-month history is tracked.
alter table dim_client add column monthly_ad_budget numeric(14, 2);
