# Warera Analytics

Initial Next.js scaffold for the Warera analytics app.

## Stack

- Next.js 16 App Router
- TypeScript
- Tailwind CSS 4
- Drizzle ORM
- Neon Postgres
- @wareraprojects/api
- Recharts

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run typecheck
npm run db:generate
npm run db:push
npm run db:studio
```

## Environment

Copy `.env.example` to `.env.local` and fill in the values before wiring up the data layer.

R2 archive support uses these extra variables:

- `R2_ACCOUNT_ID`
- `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ARCHIVE_PREFIX`

## Sync

- Protected route: `GET /api/internal/sync`
- Cleanup route: `GET /api/internal/sync/cleanup`
- Status route: `GET /api/internal/sync/status`
- Auth header: `Authorization: Bearer ${CRON_SECRET}`
- Scheduler: GitHub Actions every 6 hours
- Sync runs in repeated passes until the staging snapshot is complete and promoted
- Cleanup runs after sync until retention/archive work is idle
- Snapshot storage: Postgres staging + atomic promotion
- Hot retention: newest 2 successful snapshots stay queryable in Neon
- Long-term history: consecutive delta tables in Neon
- Raw snapshot archive: Cloudflare R2 before Neon pruning
- Locking: Postgres advisory lock

## Project Plan

The current SDK-based plan and implemented architecture live in [WARERA_V1_1_PLAN.md](./WARERA_V1_1_PLAN.md).
