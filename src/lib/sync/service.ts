import "server-only";

import { and, desc, eq, lt, sql } from "drizzle-orm";

import { getDb, withSyncAdvisoryLock } from "@/lib/db/client";
import {
  appState,
  companySnapshotRows,
  countryReference,
  regionReference,
  snapshots,
  syncRuns,
} from "@/lib/db/schema";
import { CURRENT_SNAPSHOT_STATE_KEY, SYNC_STALE_AFTER_MS } from "@/lib/sync/constants";
import {
  normalizeCompanySnapshotRow,
  normalizeCountries,
  normalizeOwnerSnapshot,
  normalizeRegions,
  type CompanySnapshotRowInput,
  type CountryReferenceRowInput,
  type OwnerSnapshotInput,
  type RegionReferenceRowInput,
} from "@/lib/sync/normalize";
import { getWareraClient } from "@/lib/warera/client";

export type SyncSummary = {
  snapshotId: string;
  runId: string;
  companyPagesProcessed: number;
  companyRowsWritten: number;
  uniqueUsersFetched: number;
  durationMs: number;
};

const STALE_MESSAGE = "Marked stale before starting a new sync run.";

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

async function markStaleRuns() {
  const db = getDb();
  const staleBefore = new Date(Date.now() - SYNC_STALE_AFTER_MS);

  await db
    .update(syncRuns)
    .set({
      status: "stale",
      finishedAt: new Date(),
      updatedAt: new Date(),
      errorMessage: STALE_MESSAGE,
    })
    .where(and(eq(syncRuns.status, "running"), lt(syncRuns.updatedAt, staleBefore)));
}

async function updateRunProgress(input: {
  runId: string;
  phase: "load_reference_data" | "sync_company_pages" | "build_aggregates" | "promote_snapshot";
  phaseCursor?: string | null;
  companyPagesProcessed?: number;
  companyRowsWritten?: number;
  uniqueUsersFetched?: number;
}) {
  const db = getDb();

  await db
    .update(syncRuns)
    .set({
      phase: input.phase,
      phaseCursor: input.phaseCursor ?? null,
      companyPagesProcessed: input.companyPagesProcessed,
      companyRowsWritten: input.companyRowsWritten,
      uniqueUsersFetched: input.uniqueUsersFetched,
      updatedAt: new Date(),
    })
    .where(eq(syncRuns.id, input.runId));
}

async function bulkInsertCompanies(rows: CompanySnapshotRowInput[]) {
  if (rows.length === 0) {
    return;
  }

  const db = getDb();

  for (const batch of chunk(rows, 250)) {
    await db.insert(companySnapshotRows).values(batch);
  }
}

async function buildCountryAggregates(snapshotId: string) {
  const db = getDb();

  await db.execute(sql`
    insert into country_aggregates (
      snapshot_id,
      country_id,
      country_code,
      country_name,
      income_tax,
      market_tax,
      self_work_tax,
      company_count,
      regions_with_companies,
      domestic_owned_count,
      foreign_owned_count,
      unique_owner_countries,
      top_owner_country_code,
      top_owner_country_name,
      top_owner_country_company_count
    )
    with ownership as (
      select
        snapshot_id,
        country_id,
        count(*)::int as company_count,
        count(distinct region_id)::int as regions_with_companies,
        count(*) filter (where owner_country_id = country_id)::int as domestic_owned_count,
        count(*) filter (where owner_country_id is not null and owner_country_id <> country_id)::int as foreign_owned_count,
        count(distinct owner_country_id) filter (where owner_country_id is not null)::int as unique_owner_countries
      from company_snapshot_rows
      where snapshot_id = ${snapshotId}
      group by snapshot_id, country_id
    ),
    owner_counts as (
      select
        snapshot_id,
        country_id,
        owner_country_code,
        owner_country_name,
        count(*)::int as company_count
      from company_snapshot_rows
      where snapshot_id = ${snapshotId}
      group by snapshot_id, country_id, owner_country_code, owner_country_name
    ),
    top_owner as (
      select
        snapshot_id,
        country_id,
        owner_country_code,
        owner_country_name,
        company_count
      from (
        select
          owner_counts.*,
          row_number() over (
            partition by country_id
            order by company_count desc, coalesce(owner_country_code, 'zzzz') asc
          ) as row_num
        from owner_counts
      ) ranked
      where row_num = 1
    )
    select
      reference.snapshot_id,
      reference.country_id,
      reference.country_code,
      reference.country_name,
      reference.income_tax,
      reference.market_tax,
      reference.self_work_tax,
      coalesce(ownership.company_count, 0),
      coalesce(ownership.regions_with_companies, 0),
      coalesce(ownership.domestic_owned_count, 0),
      coalesce(ownership.foreign_owned_count, 0),
      coalesce(ownership.unique_owner_countries, 0),
      top_owner.owner_country_code,
      top_owner.owner_country_name,
      coalesce(top_owner.company_count, 0)
    from country_reference as reference
    left join ownership
      on ownership.snapshot_id = reference.snapshot_id
      and ownership.country_id = reference.country_id
    left join top_owner
      on top_owner.snapshot_id = reference.snapshot_id
      and top_owner.country_id = reference.country_id
    where reference.snapshot_id = ${snapshotId}
  `);
}

async function buildRegionAggregates(snapshotId: string) {
  const db = getDb();

  await db.execute(sql`
    insert into region_aggregates (
      snapshot_id,
      region_id,
      region_code,
      region_name,
      country_id,
      country_code,
      country_name,
      income_tax,
      development,
      company_count,
      domestic_owned_count,
      foreign_owned_count,
      unique_owner_countries,
      top_owner_country_code,
      top_owner_country_name,
      top_owner_country_company_count
    )
    with ownership as (
      select
        snapshot_id,
        region_id,
        count(*)::int as company_count,
        count(*) filter (where owner_country_id = country_id)::int as domestic_owned_count,
        count(*) filter (where owner_country_id is not null and owner_country_id <> country_id)::int as foreign_owned_count,
        count(distinct owner_country_id) filter (where owner_country_id is not null)::int as unique_owner_countries
      from company_snapshot_rows
      where snapshot_id = ${snapshotId}
      group by snapshot_id, region_id
    ),
    owner_counts as (
      select
        snapshot_id,
        region_id,
        owner_country_code,
        owner_country_name,
        count(*)::int as company_count
      from company_snapshot_rows
      where snapshot_id = ${snapshotId}
      group by snapshot_id, region_id, owner_country_code, owner_country_name
    ),
    top_owner as (
      select
        snapshot_id,
        region_id,
        owner_country_code,
        owner_country_name,
        company_count
      from (
        select
          owner_counts.*,
          row_number() over (
            partition by region_id
            order by company_count desc, coalesce(owner_country_code, 'zzzz') asc
          ) as row_num
        from owner_counts
      ) ranked
      where row_num = 1
    )
    select
      reference.snapshot_id,
      reference.region_id,
      reference.region_code,
      reference.region_name,
      reference.country_id,
      reference.country_code,
      reference.country_name,
      country_reference.income_tax,
      reference.development,
      coalesce(ownership.company_count, 0),
      coalesce(ownership.domestic_owned_count, 0),
      coalesce(ownership.foreign_owned_count, 0),
      coalesce(ownership.unique_owner_countries, 0),
      top_owner.owner_country_code,
      top_owner.owner_country_name,
      coalesce(top_owner.company_count, 0)
    from region_reference as reference
    inner join country_reference
      on country_reference.snapshot_id = reference.snapshot_id
      and country_reference.country_id = reference.country_id
    left join ownership
      on ownership.snapshot_id = reference.snapshot_id
      and ownership.region_id = reference.region_id
    left join top_owner
      on top_owner.snapshot_id = reference.snapshot_id
      and top_owner.region_id = reference.region_id
    where reference.snapshot_id = ${snapshotId}
  `);
}

async function promoteSnapshot(snapshotId: string, runId: string) {
  const db = getDb();
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(snapshots)
      .set({ status: "archived" })
      .where(eq(snapshots.status, "promoted"));

    await tx
      .update(snapshots)
      .set({
        status: "promoted",
        completedAt: now,
      })
      .where(eq(snapshots.id, snapshotId));

    await tx
      .insert(appState)
      .values({
        key: CURRENT_SNAPSHOT_STATE_KEY,
        value: snapshotId,
      })
      .onConflictDoUpdate({
        target: appState.key,
        set: { value: snapshotId },
      });

    await tx
      .update(syncRuns)
      .set({
        status: "completed",
        phase: "promote_snapshot",
        updatedAt: now,
        finishedAt: now,
      })
      .where(eq(syncRuns.id, runId));
  });
}

async function failRun(input: {
  snapshotId: string | null;
  runId: string | null;
  error: unknown;
}) {
  const db = getDb();
  const message =
    input.error instanceof Error ? input.error.message : "Unknown sync failure.";
  const now = new Date();

  if (input.snapshotId) {
    await db
      .update(snapshots)
      .set({
        status: "failed",
        completedAt: now,
        notes: message,
      })
      .where(eq(snapshots.id, input.snapshotId));
  }

  if (input.runId) {
    await db
      .update(syncRuns)
      .set({
        status: "failed",
        updatedAt: now,
        finishedAt: now,
        errorMessage: message,
      })
      .where(eq(syncRuns.id, input.runId));
  }
}

export async function runFullSync(source: "manual" | "scheduled" = "manual") {
  await markStaleRuns();

  const lockResult = await withSyncAdvisoryLock(async () => {
    const db = getDb();
    const client = getWareraClient();
    const startedAt = Date.now();

    let snapshotId: string | null = null;
    let runId: string | null = null;

    try {
      const [snapshot] = await db
        .insert(snapshots)
        .values({
          source,
          status: "staging",
        })
        .returning({ id: snapshots.id });

      const activeSnapshotId = snapshot.id;
      snapshotId = activeSnapshotId;

      const [syncRun] = await db
        .insert(syncRuns)
        .values({
          snapshotId: activeSnapshotId,
          status: "running",
          phase: "load_reference_data",
        })
        .returning({ id: syncRuns.id });

      const activeRunId = syncRun.id;
      runId = activeRunId;

      const countries = await client.country.getAllCountries();
      const countryRows = normalizeCountries(activeSnapshotId, countries);
      const countryById = new Map<string, CountryReferenceRowInput>(
        countryRows.map((country) => [country.countryId, country]),
      );

      await db.insert(countryReference).values(countryRows);

      const regions = await client.region.getRegionsObject();
      const regionRows = normalizeRegions(activeSnapshotId, regions, countryById);
      const regionById = new Map<string, RegionReferenceRowInput>(
        regionRows.map((region) => [region.regionId, region]),
      );

      await db.insert(regionReference).values(regionRows);

      const ownerCache = new Map<string, OwnerSnapshotInput>();
      let companyPagesProcessed = 0;
      let companyRowsWritten = 0;
      let uniqueUsersFetched = 0;
      let lastCursor: string | null = null;

      await updateRunProgress({
        runId: activeRunId,
        phase: "sync_company_pages",
        companyPagesProcessed,
        companyRowsWritten,
        uniqueUsersFetched,
      });

      for await (const page of client.company.getCompanies({
        perPage: 100,
        autoPaginate: true,
      })) {
        companyPagesProcessed += 1;
        lastCursor = page.cursor || null;

        const companies = await Promise.all(
          page.items.map((companyId) => client.company.getById({ companyId })),
        );

        const missingOwnerIds = Array.from(
          new Set(
            companies
              .map((company) => company.user)
              .filter((userId) => !ownerCache.has(userId)),
          ),
        );

        if (missingOwnerIds.length > 0) {
          const users = await Promise.all(
            missingOwnerIds.map((userId) => client.user.getUserLite({ userId })),
          );

          for (const user of users) {
            ownerCache.set(user._id, normalizeOwnerSnapshot(user, countryById));
          }

          uniqueUsersFetched += missingOwnerIds.length;
        }

        const companyRows = companies.map((company) => {
          const owner = ownerCache.get(company.user);

          if (!owner) {
            throw new Error(`Missing owner cache entry for user ${company.user}.`);
          }

          return normalizeCompanySnapshotRow({
            snapshotId: activeSnapshotId,
            company,
            regionById,
            owner,
          });
        });

        await bulkInsertCompanies(companyRows);

        companyRowsWritten += companyRows.length;

        await updateRunProgress({
          runId: activeRunId,
          phase: "sync_company_pages",
          phaseCursor: lastCursor,
          companyPagesProcessed,
          companyRowsWritten,
          uniqueUsersFetched,
        });
      }

      await updateRunProgress({
        runId: activeRunId,
        phase: "build_aggregates",
        phaseCursor: lastCursor,
        companyPagesProcessed,
        companyRowsWritten,
        uniqueUsersFetched,
      });

      await buildCountryAggregates(activeSnapshotId);
      await buildRegionAggregates(activeSnapshotId);
      await promoteSnapshot(activeSnapshotId, activeRunId);

      return {
        snapshotId: activeSnapshotId,
        runId: activeRunId,
        companyPagesProcessed,
        companyRowsWritten,
        uniqueUsersFetched,
        durationMs: Date.now() - startedAt,
      } satisfies SyncSummary;
    } catch (error) {
      await failRun({ snapshotId, runId, error });
      throw error;
    }
  });

  if (!lockResult.acquired) {
    return {
      ok: false as const,
      reason: "sync-already-running",
    };
  }

  return {
    ok: true as const,
    summary: lockResult.value,
  };
}

export async function getLatestSyncRunStatus() {
  const db = getDb();

  const latestRun = await db.query.syncRuns.findFirst({
    orderBy: [desc(syncRuns.startedAt)],
  });

  const currentSnapshot = await db.query.snapshots.findFirst({
    where: eq(snapshots.status, "promoted"),
    orderBy: [desc(snapshots.completedAt)],
  });

  return {
    currentSnapshot,
    latestRun,
  };
}
