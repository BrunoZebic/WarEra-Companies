# Warera Analytics v1.1

This repo implements the SDK-based Warera analytics architecture.

## Core decisions

- `@wareraprojects/api` is the primary Warera client.
- Sync runs against `https://api2.warera.io/trpc` with an explicit `rateLimit: 450`.
- `WARERA_API_KEY` is the primary env var, with `WARERA_API_TOKEN` kept as a fallback alias.
- Postgres is the only required backend service in v1.1.
- Sync scheduling happens outside Vercel via GitHub Actions every 6 hours.

## Data pipeline

- `GET /api/internal/sync` is a protected route with `Authorization: Bearer ${CRON_SECRET}`.
- The sync acquires a Postgres advisory lock before doing any work.
- A new snapshot is created in `staging` state together with a `sync_runs` row.
- Countries and regions are fetched first and stored as reference tables for the snapshot.
- Companies are synced page by page using `client.company.getCompanies({ perPage: 100, autoPaginate: true })`.
- Company detail calls and owner detail calls are issued via `Promise.all`, with batching handled by the SDK.
- Owner data is deduplicated in memory during the run.
- Company rows are inserted into `company_snapshot_rows` as each page completes.
- Country and region aggregates are built in SQL after all rows are staged.
- The snapshot is promoted atomically only after the full run succeeds.
- Failed syncs leave the currently promoted snapshot untouched.

## Read model

- `company_snapshot_rows` stores the company-level drilldown dataset.
- `country_aggregates` powers the countries overview and country detail pages.
- `region_aggregates` powers the regions overview and region detail pages.
- Ownership in the UI uses the owner’s current Warera `user.country`.

## User-facing scope

- `/` dashboard
- `/countries`
- `/countries/[code]`
- `/regions`
- `/regions/[code]`

## Operational notes

- The sync route exports `maxDuration = 300`.
- GitHub Actions uses workflow `concurrency` to avoid overlapping scheduled runs.
- Postgres advisory locking provides the second safety layer if multiple triggers happen anyway.
- Initial SQL migration is generated in [drizzle/0000_tearful_moondragon.sql](/e:/Projects/aistuff/warera-companies/drizzle/0000_tearful_moondragon.sql).
