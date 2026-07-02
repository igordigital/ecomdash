# Infra

## Deploy targets

- **Web** (`apps/web`): Vercel, connected to this GitHub repo. Root directory
  `apps/web`, framework Next.js. PRs get preview deployments.
- **Worker** (`jobs`): Railway, connected to this repo. Start command:
  `pnpm --filter @ecomdash/jobs worker`.
- **Database**: Supabase (single project; per-client is configuration, not
  infrastructure). Migrations applied by `.github/workflows/migrate.yml`.

## Cron

First client: GitHub Actions cron (`daily-refresh.yml`), gated behind the
`DAILY_REFRESH_ENABLED` repo variable. Before multi-client, move scheduling to
the worker (pg-boss `schedule`) and delete the Actions cron.

## Secrets

Local: `.env` (never committed; see `.env.example`).
CI/cron: GitHub Actions secrets.
Runtime: Vercel / Railway env vars.
Per-client platform credentials: `client_credentials` table + Supabase Vault,
never in the repo or env.

## Day-one external tasks (human latency, start immediately)

1. Google Ads: apply for developer token (Basic access) under the agency MCC.
2. Meta: create BM system user with ads_read; confirm client ad account shares.
3. GA4: create the shared service account; clients add it as Viewer per property.
