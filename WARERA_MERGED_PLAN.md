# Warera Analytics v1 Plan

## Summary
- Build a new Next.js web app for Warera analytics in this folder and deploy it on Vercel.
- Primary user goal: understand how many companies exist in each region and country, who owns them by current Warera country, and how that distribution relates to country income tax.
- V1 is analytics-first: dashboard, countries view, regions view, and country/region detail drilldowns.
- V1 explicitly does not include a world-map-first experience, public write actions, or a standalone full-company explorer page.

## Product Scope

### Core questions the app must answer
- How many companies are in each region?
- How many companies are in each country?
- Which owner countries dominate a region or country?
- What share of companies in a country are owned by domestic vs foreign owners?
- How does company concentration compare with `income` tax by country?

### In scope for v1
- Overview dashboard
- Countries table and country detail page
- Regions table and region detail page
- Daily background snapshot sync
- Snapshot freshness and sync-status visibility
- Croatian UI copy

### Out of scope for v1
- World choropleth map
- Public manual sync button
- Public full `/companies` listing
- Real-time refresh
- User accounts or role-based admin UI

## Verified Data Inputs
- Warera API base path: `https://api2.warera.io/trpc`
- Auth: Bearer token via `WARERA_API_TOKEN`
- Call shape: `GET` requests with plain JSON in the `input` query parameter
- tRPC batching works for repeated procedures and should be used for `company.getById` and `user.getUserLite`
- Important endpoints:
  - `country.getAllCountries`
  - `region.getRegionsObject`
  - `company.getCompanies`
  - `company.getById`
  - `user.getUserLite`
- Current operational assumption: one API token is limited to `200 requests/minute`

## Working Assumptions
- There are roughly `10,000` active players and about `5` companies per player, so plan for `~50,000` companies.
- Companies move between regions every few days, so a daily snapshot is acceptable for v1.
- "Owner citizenship" in the UI means the owner's current Warera `user.country`, not a real-world identity field.
- The shared API token should be rotated before production because it was exposed in chat.

## Architecture

### Frontend
- Next.js `15` with App Router and TypeScript
- Tailwind CSS for styling
- `shadcn/ui` for primitives
- `Recharts` for charts
- Server Components by default
- Small client components only for table controls, chart interaction, and sync-status polling

### Backend and storage
- Neon Postgres via Vercel Marketplace as the primary data store
- Upstash Redis via Vercel Marketplace for locking, ephemeral status, and rate-limiter state
- Internal Route Handlers for sync orchestration
- No public data API routes in v1; pages read from Postgres directly on the server

### Deployment target
- Vercel
- Daily Cron Job hitting an internal `GET` route
- `CRON_SECRET` used to secure cron invocations and internal sync chaining

## Why this architecture
- A full refresh is too large for a single in-memory cache-only job.
- Approximate request budget for a full sync:
  - `500` requests for `company.getCompanies` at `100/page`
  - `1,000` batched requests for `company.getById` at `50/request`
  - `~200` batched requests for `user.getUserLite` at `50/request`
  - Total: `~1,700` upstream requests
- At a safe ceiling of `180 requests/minute`, a full refresh takes about `9-10 minutes` before overhead.
- Because Vercel Cron is `GET`-based, not retried on failure, and may overlap if not guarded, the sync must be resumable, rate-limited, lock-protected, and atomic.

## Data Model

### `snapshots`
- `id`
- `created_at`
- `status` enum: `staging | promoted | failed | pruned`
- `source` enum: `daily_cron | manual_retry`
- `completed_at`
- `notes`

### `sync_runs`
- `id`
- `snapshot_id`
- `status` enum: `queued | running | completed | failed | stale`
- `phase` enum:
  - `load_countries`
  - `load_regions`
  - `list_company_ids`
  - `hydrate_companies`
  - `hydrate_users`
  - `build_aggregates`
  - `promote_snapshot`
- `phase_cursor`
- `requests_used_in_phase`
- `company_ids_total`
- `company_ids_processed`
- `companies_hydrated`
- `users_hydrated`
- `started_at`
- `updated_at`
- `finished_at`
- `error_message`

### `country_reference`
- `snapshot_id`
- `country_id`
- `country_code`
- `country_name`
- `income_tax`
- `market_tax`
- `self_work_tax`
- raw metadata columns needed by UI only

### `region_reference`
- `snapshot_id`
- `region_id`
- `region_code`
- `region_name`
- `country_id`
- `country_code`
- `country_name`
- `development`
- `main_city`
- `position_lat`
- `position_lng`

### `company_snapshot_rows`
- `snapshot_id`
- `company_id`
- `company_name`
- `item_code`
- `region_id`
- `region_code`
- `region_name`
- `country_id`
- `country_code`
- `country_name`
- `owner_user_id`
- `owner_username`
- `owner_country_id`
- `owner_country_code`
- `owner_country_name`
- `worker_count`
- `estimated_value`
- `production`
- `is_full`
- `warera_updated_at`

### `country_aggregates`
- `snapshot_id`
- `country_id`
- `country_code`
- `country_name`
- `income_tax`
- `market_tax`
- `self_work_tax`
- `company_count`
- `regions_with_companies`
- `domestic_owned_count`
- `foreign_owned_count`
- `unique_owner_countries`
- `top_owner_country_code`
- `top_owner_country_name`
- `top_owner_country_company_count`

### `region_aggregates`
- `snapshot_id`
- `region_id`
- `region_code`
- `region_name`
- `country_id`
- `country_code`
- `country_name`
- `income_tax`
- `development`
- `company_count`
- `domestic_owned_count`
- `foreign_owned_count`
- `unique_owner_countries`
- `top_owner_country_code`
- `top_owner_country_name`
- `top_owner_country_company_count`

### `app_state`
- `key`
- `value`
- Required keys:
  - `current_snapshot_id`
  - `last_successful_sync_run_id`

## Database Indexes
- Unique: `company_snapshot_rows (snapshot_id, company_id)`
- Unique: `country_reference (snapshot_id, country_code)`
- Unique: `region_reference (snapshot_id, region_code)`
- Unique: `country_aggregates (snapshot_id, country_code)`
- Unique: `region_aggregates (snapshot_id, region_code)`
- Index: `company_snapshot_rows (snapshot_id, region_code)`
- Index: `company_snapshot_rows (snapshot_id, country_code)`
- Index: `company_snapshot_rows (snapshot_id, owner_country_code)`
- Index: `company_snapshot_rows (snapshot_id, owner_user_id)`
- Index: `sync_runs (status, updated_at desc)`

## Internal Routes

### `GET /api/internal/sync/start`
- Protected by `Authorization: Bearer ${CRON_SECRET}`
- Called by Vercel Cron once per day
- Responsibilities:
  - acquire Redis lock `warera:sync:lock`
  - fail fast if a live run already owns the lock
  - mark stale runs as `stale` if they have not updated within the stale timeout
  - create a new `snapshots` row with `status=staging`
  - create a new `sync_runs` row with `phase=load_countries`
  - return `202`
  - schedule the first step using `after(() => fetch('/api/internal/sync/step?...'))`

### `GET /api/internal/sync/step`
- Protected by `Authorization: Bearer ${CRON_SECRET}`
- Accepts `runId`
- Route config:
  - `export const runtime = 'nodejs'`
  - `export const maxDuration = 60`
- Responsibilities:
  - verify lock ownership for the run
  - renew the lock TTL
  - process only a bounded slice of work
  - persist progress before returning
  - if more work remains, schedule the next step with `after`
  - if all phases succeed, promote the snapshot and release the lock
  - if any fatal error occurs, mark run and snapshot as failed and release the lock

### `GET /api/internal/sync/status`
- Protected by `Authorization: Bearer ${CRON_SECRET}`
- Returns current run status, current phase, processed counts, and last successful snapshot timestamp
- Used for internal debugging and optional admin/dev visibility

## Sync Budget Rules
- Hard target: do not exceed `180` upstream Warera requests per minute
- Per step limits:
  - stop after `90` upstream requests, or
  - stop after `45` seconds of work,
  - whichever happens first
- Only one sync run may call Warera at a time
- All Warera fetches pass through one shared rate-limiter utility

## Sync Phases

### 1. Load countries
- Fetch `country.getAllCountries`
- Insert rows into `country_reference` for the staging snapshot
- This phase is a single request

### 2. Load regions
- Fetch `region.getRegionsObject`
- Join each region to its country reference
- Insert rows into `region_reference` for the staging snapshot
- This phase is a single request

### 3. List company IDs
- Page through `company.getCompanies` with `perPage=100`
- Persist each returned company id to an in-memory batch buffer for the current step only
- Persist `nextCursor` in `sync_runs.phase_cursor`
- For each page pulled in the same step, immediately enqueue its ids for hydration instead of waiting for the full list to finish

### 4. Hydrate companies
- Batch `company.getById` requests at `50 company ids` per upstream request
- Normalize only fields needed by UI or aggregations
- Join each company to `region_reference`
- Insert hydrated rows into `company_snapshot_rows`
- Track owner user ids discovered from hydrated companies in a deduplicated staging table or run-state structure

### 5. Hydrate users
- Batch `user.getUserLite` requests at `50 user ids` per upstream request
- Update matching `company_snapshot_rows` with:
  - `owner_username`
  - `owner_country_id`
  - `owner_country_code`
  - `owner_country_name`
- If a user lookup fails or returns missing data, keep the row and mark owner-country fields as unknown rather than dropping the company

### 6. Build aggregates
- Compute `country_aggregates` from `company_snapshot_rows` joined to `country_reference`
- Compute `region_aggregates` from `company_snapshot_rows` joined to `region_reference` and `country_reference`
- Domestic ownership rule:
  - `domestic_owned_count` when `owner_country_id = country_id`
  - otherwise `foreign_owned_count`
- `unique_owner_countries` excludes null owner-country values
- `top_owner_country_*` uses the highest company count, with alphabetical `country_code` as the tie-breaker

### 7. Promote snapshot
- In one transaction:
  - verify staging snapshot row counts are non-zero
  - set previous promoted snapshot to historical state
  - update `app_state.current_snapshot_id`
  - set staging snapshot to `promoted`
  - mark `sync_runs.status=completed`
- After promotion:
  - invalidate page caches with `revalidatePath('/')`, `revalidatePath('/countries')`, and `revalidatePath('/regions')`
  - release the Redis lock

## Failure and Recovery Rules
- If any step fails, do not change `current_snapshot_id`
- If a step crashes mid-run, previously promoted data stays live
- If the lock exists but the matching run has not updated within `10 minutes`, treat it as stale on the next `start` call
- If a user or company detail fetch fails transiently, retry with capped exponential backoff inside the current step while still respecting the request budget
- After `3` failed attempts for a single upstream request, record the error and fail the run

## Snapshot Retention
- Keep:
  - the current promoted snapshot
  - the immediately previous promoted snapshot
  - the latest failed snapshot for debugging
- After a successful promotion, prune older snapshot rows and old `sync_runs`

## Page Structure

### `/`
- Header with snapshot freshness
- Sync-status banner when a run is active
- KPI cards:
  - total companies
  - countries with companies
  - regions with companies
  - unique owner countries
- Charts:
  - top 10 countries by company count
  - top 10 regions by company count
  - domestic vs foreign ownership overall
  - scatter or ranked comparison of country income tax vs company count
- Tables:
  - countries with lowest income tax and highest company counts
  - regions with highest company density

### `/countries`
- Sortable, searchable table
- Columns:
  - country
  - income tax
  - market tax
  - self-work tax
  - company count
  - regions with companies
  - domestic owned
  - foreign owned
  - unique owner countries
- Default sort: `company_count desc`
- Row click goes to `/countries/[code]`

### `/countries/[code]`
- Country summary header
- Tax summary block
- Ownership mix chart
- Top owner-country chart
- Region breakdown table for regions inside the country
- Small company sample table showing the first 50 companies in that country ordered by region then name

### `/regions`
- Sortable, searchable table
- Columns:
  - region
  - country
  - income tax
  - development
  - company count
  - domestic owned
  - foreign owned
  - unique owner countries
- Default sort: `company_count desc`
- Row click goes to `/regions/[code]`

### `/regions/[code]`
- Region summary header
- Parent-country tax context
- Ownership mix chart
- Top owner-country chart
- Company table for all companies in the region
- Company table columns:
  - company
  - item
  - owner
  - owner country
  - workers
  - estimated value
  - production

## UI Decisions
- Language: Croatian-first labels and navigation
- Warera entity names remain as returned by the API
- Visual direction:
  - clean strategy-dashboard feel
  - light theme by default
  - no purple-heavy palette
- Use server-rendered tables with URL search params for sorting and filtering
- Use a small client sync-status component that polls every `15s` only while a sync is active

## File Layout
- `app/(dashboard)/page.tsx`
- `app/(dashboard)/countries/page.tsx`
- `app/(dashboard)/countries/[code]/page.tsx`
- `app/(dashboard)/regions/page.tsx`
- `app/(dashboard)/regions/[code]/page.tsx`
- `app/api/internal/sync/start/route.ts`
- `app/api/internal/sync/step/route.ts`
- `app/api/internal/sync/status/route.ts`
- `components/`
- `lib/warera/`
- `lib/db/`
- `lib/sync/`
- `lib/types/`

## Implementation Conventions
- ORM: Drizzle ORM with SQL migrations
- Runtime for sync routes: Node.js
- Use absolute server-only modules for:
  - Warera client
  - rate limiter
  - sync state machine
  - aggregate builders
- No client exposure of the Warera token
- No direct browser fetches to Warera

## Environment Variables
- `WARERA_API_TOKEN`
- `WARERA_API_BASE_URL=https://api2.warera.io/trpc`
- `DATABASE_URL`
- `REDIS_URL`
- `CRON_SECRET`
- `APP_URL`

## Testing Plan

### Unit tests
- Warera request builders
- tRPC batch input formatting
- response normalizers for countries, regions, companies, and users
- domestic vs foreign ownership calculations
- aggregate builders
- stale-run detection and lock-handling utilities

### Integration tests
- step-by-step sync progression across all phases
- rate limiter honoring the `180 req/min` cap
- snapshot promotion transaction
- failure behavior preserving the previous snapshot
- duplicate `start` requests not creating concurrent runs

### End-to-end smoke tests
- overview page loads with promoted snapshot data
- countries table sorts and links correctly
- regions table sorts and links correctly
- region detail count matches the listed company rows
- country detail tax values match country reference data

## Implementation Order
1. Scaffold Next.js app, styling stack, and base layout
2. Set up Drizzle, Neon Postgres, and Redis clients
3. Build Warera client and shared rate limiter
4. Create schema and migrations for snapshot tables
5. Implement sync state machine and internal routes
6. Seed first successful snapshot locally or in preview
7. Build dashboard, countries, and regions pages from live snapshot data
8. Add charts, sync-status banner, and cache invalidation
9. Add retention cleanup and failure observability
10. Deploy to Vercel and configure daily cron

## Vercel Notes
- Cron Jobs invoke functions with `GET`
- With `CRON_SECRET` configured, Vercel sends `Authorization: Bearer <CRON_SECRET>`
- Hobby cron precision is daily with hourly jitter
- Function duration limits still apply to cron invocations, so the sync must be chunked even though cron is used
- Marketplace storage should be used instead of legacy Vercel KV for new projects

## References
- Warera docs: https://api2.warera.io/docs/
- Warera OpenAPI: https://api2.warera.io/openapi.json
- Vercel Cron Jobs: https://vercel.com/docs/cron-jobs
- Managing Cron Jobs: https://vercel.com/docs/cron-jobs/manage-cron-jobs
- Cron usage and pricing: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Vercel function duration: https://vercel.com/docs/functions/configuring-functions/duration
- Storage on Vercel Marketplace: https://vercel.com/docs/marketplace-storage
- Redis on Vercel: https://vercel.com/docs/redis
- Next.js `after`: https://nextjs.org/docs/app/api-reference/functions/after
