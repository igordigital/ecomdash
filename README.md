# ecomdash

Per-client e-commerce control dashboard. Answers, daily: how efficiently spend
converts to real revenue (blended MER, store-anchored), which campaigns and ads
are healthy or degrading, what the website is doing, and whether store revenue
agrees with what the platforms claim.

All data is pulled daily into our own warehouse. The app never makes live API
calls to Meta, Google, or GA4 at request time; it reads pre-built marts.

## Invariants

1. **Total revenue only ever comes from the store.** Platform conversions are
   diagnostic only, never additive across platforms (double-counts by 30-50%).
2. **MER is the north star.** MER = store net revenue / total ad spend. It
   credits all revenue to paid spend, intentionally, and is labeled as such.
3. **Ad facts are restated daily, not appended.** Trailing windows: Meta 28d,
   Google ~28d, GA4 7d, orders 30d. Upsert-replace by grain; `loaded_at` on
   every row.
4. **Grain discipline.** `fact_ad_daily` is platform x campaign x group x ad x
   date. No product x campaign joins the platforms do not report.
5. No em dashes, no marketing filler, in client-facing generated copy.

## Layout

    apps/web                Next.js dashboard (client-scoped by auth + route)
    packages/core           connector interface, canonical types, shared utils
    packages/connectors/*   meta, google-ads, ga4, shopify, woo
    packages/warehouse      SQL migrations, upsert loader, migration runner
    packages/mer            MER rolling-window computation
    jobs                    worker, backfill + daily-refresh enqueuers
    infra                   deploy + cron + secrets notes

## Development

    pnpm install
    pnpm typecheck
    pnpm build
    pnpm dev                          # dashboard on :3000
    DATABASE_URL=... pnpm --filter @ecomdash/warehouse migrate

## Status

Skeleton. Slice 1 in progress: Shopify orders + Meta spend into the warehouse,
one page with daily spend, store revenue, rolling 7d/28d MER. See
`infra/README.md` for deploy targets and the day-one platform-access tasks.
