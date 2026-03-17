import "server-only";

import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";

import {
  uploadGzippedNdjson,
  uploadJsonObject,
  type ArchiveObjectResult,
} from "@/lib/archive/r2";
import { getDb, withSyncAdvisoryLock } from "@/lib/db/client";
import {
  appState,
  companyDeltas,
  companySnapshotRows,
  countryAggregates,
  countryDeltas,
  countryReference,
  regionAggregates,
  regionDeltas,
  regionReference,
  snapshotArchives,
  snapshotComparisons,
  snapshots,
  syncRuns,
} from "@/lib/db/schema";
import { getR2ArchiveConfig } from "@/lib/env";
import {
  buildArchivePrefix,
  findOldestMissingComparisonPair,
  getHotSuccessfulSnapshotIds,
  type CompletedSnapshot,
  type SnapshotPair,
} from "@/lib/sync/history";
import {
  CURRENT_SNAPSHOT_STATE_KEY,
  SYNC_FAILED_RESUME_WINDOW_MS,
  SYNC_MAX_PAGES_PER_PASS,
  SYNC_STALE_AFTER_MS,
} from "@/lib/sync/constants";
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

type SyncPhase =
  | "load_reference_data"
  | "sync_company_pages"
  | "build_aggregates"
  | "build_deltas"
  | "promote_snapshot";

type ActiveRun = {
  runId: string;
  snapshotId: string;
  phase: SyncPhase;
  phaseCursor: string | null;
  companyPagesProcessed: number;
  companyRowsWritten: number;
  uniqueUsersFetched: number;
};

type CleanupAction =
  | "pruned_failed_snapshot"
  | "backfilled_snapshot_pair"
  | "archived_snapshot"
  | "pruned_archived_snapshot";

export type SyncSummary = {
  snapshotId: string;
  runId: string;
  phase:
    | "sync_company_pages"
    | "build_aggregates"
    | "build_deltas"
    | "promote_snapshot";
  companyPagesProcessed: number;
  companyRowsWritten: number;
  uniqueUsersFetched: number;
  passPagesProcessed: number;
  resumedExistingRun: boolean;
  hasMoreWork: boolean;
  durationMs: number;
};

export type CleanupSummary = {
  action: CleanupAction;
  snapshotId?: string;
  fromSnapshotId?: string;
  toSnapshotId?: string;
  durationMs: number;
};

type SnapshotArchiveManifest = {
  snapshotId: string;
  exportedAt: string;
  bucketName: string;
  objectPrefix: string;
  snapshot: {
    status: string;
    source: string;
    createdAt: string;
    completedAt: string;
    notes: string | null;
  };
  syncRun: {
    id: string;
    status: string;
    phase: string;
    companyPagesProcessed: number;
    companyRowsWritten: number;
    uniqueUsersFetched: number;
    startedAt: string;
    updatedAt: string;
    finishedAt: string | null;
    errorMessage: string | null;
  } | null;
  rowCounts: {
    countries: number;
    regions: number;
    companies: number;
    countryAggregates: number;
    regionAggregates: number;
  };
  files: Array<{
    key: string;
    sizeBytes: number;
    etag: string | null;
    rowCount: number;
  }>;
};

const STALE_MESSAGE = "Marked stale before starting a new sync run.";
const FAILED_SNAPSHOT_RETENTION_MS = 24 * 60 * 60 * 1000;
const HOT_SUCCESSFUL_SNAPSHOT_COUNT = 2;
const COMPANY_ARCHIVE_BATCH_SIZE = 1_000;

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

function buildSummary(input: {
  run: ActiveRun;
  phase: SyncSummary["phase"];
  passPagesProcessed: number;
  resumedExistingRun: boolean;
  hasMoreWork: boolean;
  startedAt: number;
}) {
  return {
    snapshotId: input.run.snapshotId,
    runId: input.run.runId,
    phase: input.phase,
    companyPagesProcessed: input.run.companyPagesProcessed,
    companyRowsWritten: input.run.companyRowsWritten,
    uniqueUsersFetched: input.run.uniqueUsersFetched,
    passPagesProcessed: input.passPagesProcessed,
    resumedExistingRun: input.resumedExistingRun,
    hasMoreWork: input.hasMoreWork,
    durationMs: Date.now() - input.startedAt,
  } satisfies SyncSummary;
}

function buildCleanupSummary(
  action: CleanupAction,
  startedAt: number,
  input: Omit<CleanupSummary, "action" | "durationMs"> = {},
) {
  return {
    action,
    ...input,
    durationMs: Date.now() - startedAt,
  } satisfies CleanupSummary;
}

async function markStaleRuns() {
  const db = getDb();
  const now = new Date();
  const staleBefore = new Date(Date.now() - SYNC_STALE_AFTER_MS);

  const staleRuns = await db
    .update(syncRuns)
    .set({
      status: "stale",
      finishedAt: now,
      updatedAt: now,
      errorMessage: STALE_MESSAGE,
    })
    .where(and(eq(syncRuns.status, "running"), lt(syncRuns.updatedAt, staleBefore)))
    .returning({ snapshotId: syncRuns.snapshotId });

  const snapshotIds = Array.from(
    new Set(staleRuns.map((run) => run.snapshotId).filter(Boolean)),
  );

  if (snapshotIds.length > 0) {
    await db
      .update(snapshots)
      .set({
        status: "failed",
        completedAt: now,
        notes: STALE_MESSAGE,
      })
      .where(inArray(snapshots.id, snapshotIds));
  }
}

async function updateRunProgress(input: {
  runId: string;
  phase: SyncPhase;
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
      phaseCursor: input.phaseCursor === undefined ? null : input.phaseCursor,
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

async function clearAggregates(snapshotId: string) {
  const db = getDb();

  await db.delete(regionAggregates).where(eq(regionAggregates.snapshotId, snapshotId));
  await db.delete(countryAggregates).where(eq(countryAggregates.snapshotId, snapshotId));
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

async function getCurrentPromotedSnapshot() {
  const db = getDb();

  return db.query.snapshots.findFirst({
    where: eq(snapshots.status, "promoted"),
    orderBy: [desc(snapshots.completedAt)],
  });
}

async function buildDeltaPair(input: SnapshotPair) {
  const db = getDb();
  const pairSnapshots = await db.query.snapshots.findMany({
    where: inArray(snapshots.id, [input.fromSnapshotId, input.toSnapshotId]),
  });

  const fromSnapshot = pairSnapshots.find((snapshot) => snapshot.id === input.fromSnapshotId);
  const toSnapshot = pairSnapshots.find((snapshot) => snapshot.id === input.toSnapshotId);

  if (!fromSnapshot?.completedAt || !toSnapshot?.completedAt) {
    throw new Error("Both snapshots must be completed before delta generation.");
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(companyDeltas)
      .where(
        and(
          eq(companyDeltas.fromSnapshotId, input.fromSnapshotId),
          eq(companyDeltas.toSnapshotId, input.toSnapshotId),
        ),
      );

    await tx
      .delete(countryDeltas)
      .where(
        and(
          eq(countryDeltas.fromSnapshotId, input.fromSnapshotId),
          eq(countryDeltas.toSnapshotId, input.toSnapshotId),
        ),
      );

    await tx
      .delete(regionDeltas)
      .where(
        and(
          eq(regionDeltas.fromSnapshotId, input.fromSnapshotId),
          eq(regionDeltas.toSnapshotId, input.toSnapshotId),
        ),
      );

    await tx
      .delete(snapshotComparisons)
      .where(
        and(
          eq(snapshotComparisons.fromSnapshotId, input.fromSnapshotId),
          eq(snapshotComparisons.toSnapshotId, input.toSnapshotId),
        ),
      );

    await tx.execute(sql`
      insert into company_deltas (
        from_snapshot_id,
        to_snapshot_id,
        company_id,
        exists_in_from,
        exists_in_to,
        from_region_id,
        to_region_id,
        from_country_id,
        to_country_id,
        from_owner_country_id,
        to_owner_country_id,
        region_changed,
        country_changed,
        owner_country_changed,
        worker_count_delta,
        estimated_value_delta,
        production_delta
      )
      with paired_rows as (
        select
          coalesce(from_rows.company_id, to_rows.company_id) as company_id,
          from_rows.company_id is not null as exists_in_from,
          to_rows.company_id is not null as exists_in_to,
          from_rows.region_id as from_region_id,
          to_rows.region_id as to_region_id,
          from_rows.country_id as from_country_id,
          to_rows.country_id as to_country_id,
          from_rows.owner_country_id as from_owner_country_id,
          to_rows.owner_country_id as to_owner_country_id,
          (
            from_rows.company_id is not null
            and to_rows.company_id is not null
            and from_rows.region_id is distinct from to_rows.region_id
          ) as region_changed,
          (
            from_rows.company_id is not null
            and to_rows.company_id is not null
            and from_rows.country_id is distinct from to_rows.country_id
          ) as country_changed,
          (
            from_rows.company_id is not null
            and to_rows.company_id is not null
            and from_rows.owner_country_id is distinct from to_rows.owner_country_id
          ) as owner_country_changed,
          case
            when from_rows.worker_count is not null or to_rows.worker_count is not null
              then coalesce(to_rows.worker_count, 0) - coalesce(from_rows.worker_count, 0)
            else null
          end as worker_count_delta,
          case
            when from_rows.estimated_value is not null or to_rows.estimated_value is not null
              then coalesce(to_rows.estimated_value, 0) - coalesce(from_rows.estimated_value, 0)
            else null
          end as estimated_value_delta,
          case
            when from_rows.production is not null or to_rows.production is not null
              then coalesce(to_rows.production, 0) - coalesce(from_rows.production, 0)
            else null
          end as production_delta,
          (
            from_rows.company_id is null
            or to_rows.company_id is null
            or from_rows.region_id is distinct from to_rows.region_id
            or from_rows.country_id is distinct from to_rows.country_id
            or from_rows.owner_country_id is distinct from to_rows.owner_country_id
            or from_rows.worker_count is distinct from to_rows.worker_count
            or from_rows.estimated_value is distinct from to_rows.estimated_value
            or from_rows.production is distinct from to_rows.production
          ) as tracked_changed
        from (
          select *
          from company_snapshot_rows
          where snapshot_id = ${input.fromSnapshotId}
        ) as from_rows
        full outer join (
          select *
          from company_snapshot_rows
          where snapshot_id = ${input.toSnapshotId}
        ) as to_rows
          on from_rows.company_id = to_rows.company_id
      )
      select
        ${input.fromSnapshotId},
        ${input.toSnapshotId},
        paired_rows.company_id,
        paired_rows.exists_in_from,
        paired_rows.exists_in_to,
        paired_rows.from_region_id,
        paired_rows.to_region_id,
        paired_rows.from_country_id,
        paired_rows.to_country_id,
        paired_rows.from_owner_country_id,
        paired_rows.to_owner_country_id,
        paired_rows.region_changed,
        paired_rows.country_changed,
        paired_rows.owner_country_changed,
        paired_rows.worker_count_delta,
        paired_rows.estimated_value_delta,
        paired_rows.production_delta
      from paired_rows
      where paired_rows.tracked_changed
    `);

    await tx.execute(sql`
      insert into country_deltas (
        from_snapshot_id,
        to_snapshot_id,
        country_id,
        country_code,
        country_name,
        from_company_count,
        to_company_count,
        company_count_delta,
        regions_with_companies_delta,
        domestic_owned_delta,
        foreign_owned_delta,
        unique_owner_countries_delta,
        gained_companies_count,
        lost_companies_count,
        from_income_tax,
        to_income_tax,
        income_tax_delta,
        from_market_tax,
        to_market_tax,
        market_tax_delta,
        from_self_work_tax,
        to_self_work_tax,
        self_work_tax_delta
      )
      with transitions as (
        select
          from_rows.country_id as from_country_id,
          to_rows.country_id as to_country_id
        from (
          select company_id, country_id
          from company_snapshot_rows
          where snapshot_id = ${input.fromSnapshotId}
        ) as from_rows
        full outer join (
          select company_id, country_id
          from company_snapshot_rows
          where snapshot_id = ${input.toSnapshotId}
        ) as to_rows
          on from_rows.company_id = to_rows.company_id
      ),
      movement_counts as (
        select
          country_id,
          sum(gained)::int as gained_companies_count,
          sum(lost)::int as lost_companies_count
        from (
          select
            to_country_id as country_id,
            count(*)::int as gained,
            0::int as lost
          from transitions
          where
            to_country_id is not null
            and (from_country_id is null or from_country_id <> to_country_id)
          group by to_country_id

          union all

          select
            from_country_id as country_id,
            0::int as gained,
            count(*)::int as lost
          from transitions
          where
            from_country_id is not null
            and (to_country_id is null or to_country_id <> from_country_id)
          group by from_country_id
        ) movement_union
        group by country_id
      )
      select
        ${input.fromSnapshotId},
        ${input.toSnapshotId},
        coalesce(to_rows.country_id, from_rows.country_id),
        coalesce(to_rows.country_code, from_rows.country_code),
        coalesce(to_rows.country_name, from_rows.country_name),
        coalesce(from_rows.company_count, 0),
        coalesce(to_rows.company_count, 0),
        coalesce(to_rows.company_count, 0) - coalesce(from_rows.company_count, 0),
        coalesce(to_rows.regions_with_companies, 0) - coalesce(from_rows.regions_with_companies, 0),
        coalesce(to_rows.domestic_owned_count, 0) - coalesce(from_rows.domestic_owned_count, 0),
        coalesce(to_rows.foreign_owned_count, 0) - coalesce(from_rows.foreign_owned_count, 0),
        coalesce(to_rows.unique_owner_countries, 0) - coalesce(from_rows.unique_owner_countries, 0),
        coalesce(movement_counts.gained_companies_count, 0),
        coalesce(movement_counts.lost_companies_count, 0),
        from_rows.income_tax,
        to_rows.income_tax,
        case
          when from_rows.income_tax is null or to_rows.income_tax is null then null
          else to_rows.income_tax - from_rows.income_tax
        end,
        from_rows.market_tax,
        to_rows.market_tax,
        case
          when from_rows.market_tax is null or to_rows.market_tax is null then null
          else to_rows.market_tax - from_rows.market_tax
        end,
        from_rows.self_work_tax,
        to_rows.self_work_tax,
        case
          when from_rows.self_work_tax is null or to_rows.self_work_tax is null then null
          else to_rows.self_work_tax - from_rows.self_work_tax
        end
      from (
        select *
        from country_aggregates
        where snapshot_id = ${input.fromSnapshotId}
      ) as from_rows
      full outer join (
        select *
        from country_aggregates
        where snapshot_id = ${input.toSnapshotId}
      ) as to_rows
        on from_rows.country_id = to_rows.country_id
      left join movement_counts
        on movement_counts.country_id = coalesce(to_rows.country_id, from_rows.country_id)
    `);

    await tx.execute(sql`
      insert into region_deltas (
        from_snapshot_id,
        to_snapshot_id,
        region_id,
        region_code,
        region_name,
        country_id,
        country_code,
        country_name,
        from_company_count,
        to_company_count,
        company_count_delta,
        domestic_owned_delta,
        foreign_owned_delta,
        unique_owner_countries_delta,
        gained_companies_count,
        lost_companies_count,
        net_flow
      )
      with transitions as (
        select
          from_rows.region_id as from_region_id,
          to_rows.region_id as to_region_id
        from (
          select company_id, region_id
          from company_snapshot_rows
          where snapshot_id = ${input.fromSnapshotId}
        ) as from_rows
        full outer join (
          select company_id, region_id
          from company_snapshot_rows
          where snapshot_id = ${input.toSnapshotId}
        ) as to_rows
          on from_rows.company_id = to_rows.company_id
      ),
      movement_counts as (
        select
          region_id,
          sum(gained)::int as gained_companies_count,
          sum(lost)::int as lost_companies_count
        from (
          select
            to_region_id as region_id,
            count(*)::int as gained,
            0::int as lost
          from transitions
          where
            to_region_id is not null
            and (from_region_id is null or from_region_id <> to_region_id)
          group by to_region_id

          union all

          select
            from_region_id as region_id,
            0::int as gained,
            count(*)::int as lost
          from transitions
          where
            from_region_id is not null
            and (to_region_id is null or to_region_id <> from_region_id)
          group by from_region_id
        ) movement_union
        group by region_id
      )
      select
        ${input.fromSnapshotId},
        ${input.toSnapshotId},
        coalesce(to_rows.region_id, from_rows.region_id),
        coalesce(to_rows.region_code, from_rows.region_code),
        coalesce(to_rows.region_name, from_rows.region_name),
        coalesce(to_rows.country_id, from_rows.country_id),
        coalesce(to_rows.country_code, from_rows.country_code),
        coalesce(to_rows.country_name, from_rows.country_name),
        coalesce(from_rows.company_count, 0),
        coalesce(to_rows.company_count, 0),
        coalesce(to_rows.company_count, 0) - coalesce(from_rows.company_count, 0),
        coalesce(to_rows.domestic_owned_count, 0) - coalesce(from_rows.domestic_owned_count, 0),
        coalesce(to_rows.foreign_owned_count, 0) - coalesce(from_rows.foreign_owned_count, 0),
        coalesce(to_rows.unique_owner_countries, 0) - coalesce(from_rows.unique_owner_countries, 0),
        coalesce(movement_counts.gained_companies_count, 0),
        coalesce(movement_counts.lost_companies_count, 0),
        coalesce(movement_counts.gained_companies_count, 0) - coalesce(movement_counts.lost_companies_count, 0)
      from (
        select *
        from region_aggregates
        where snapshot_id = ${input.fromSnapshotId}
      ) as from_rows
      full outer join (
        select *
        from region_aggregates
        where snapshot_id = ${input.toSnapshotId}
      ) as to_rows
        on from_rows.region_id = to_rows.region_id
      left join movement_counts
        on movement_counts.region_id = coalesce(to_rows.region_id, from_rows.region_id)
    `);

    await tx.execute(sql`
      insert into snapshot_comparisons (
        from_snapshot_id,
        to_snapshot_id,
        from_snapshot_completed_at,
        to_snapshot_completed_at,
        new_companies_count,
        deleted_companies_count,
        region_moved_count,
        country_moved_count,
        owner_country_changed_count,
        delta_build_completed_at
      )
      select
        ${input.fromSnapshotId},
        ${input.toSnapshotId},
        ${fromSnapshot.completedAt},
        ${toSnapshot.completedAt},
        count(*) filter (where exists_in_to and not exists_in_from)::int,
        count(*) filter (where exists_in_from and not exists_in_to)::int,
        count(*) filter (where region_changed)::int,
        count(*) filter (where country_changed)::int,
        count(*) filter (where owner_country_changed)::int,
        now()
      from company_deltas
      where
        from_snapshot_id = ${input.fromSnapshotId}
        and to_snapshot_id = ${input.toSnapshotId}
    `);
  });
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

async function getActiveRun() {
  const db = getDb();

  const runningRun = await db.query.syncRuns.findFirst({
    where: eq(syncRuns.status, "running"),
    orderBy: [desc(syncRuns.startedAt)],
  });

  if (runningRun) {
    return {
      runId: runningRun.id,
      snapshotId: runningRun.snapshotId,
      phase: runningRun.phase,
      phaseCursor: runningRun.phaseCursor,
      companyPagesProcessed: runningRun.companyPagesProcessed,
      companyRowsWritten: runningRun.companyRowsWritten,
      uniqueUsersFetched: runningRun.uniqueUsersFetched,
    } satisfies ActiveRun;
  }

  const resumableFailedRun = await db.query.syncRuns.findFirst({
    where: and(
      eq(syncRuns.status, "failed"),
      gt(syncRuns.updatedAt, new Date(Date.now() - SYNC_FAILED_RESUME_WINDOW_MS)),
    ),
    orderBy: [desc(syncRuns.startedAt)],
  });

  if (!resumableFailedRun) {
    return null;
  }

  await db
    .update(syncRuns)
    .set({
      status: "running",
      updatedAt: new Date(),
      finishedAt: null,
      errorMessage: null,
    })
    .where(eq(syncRuns.id, resumableFailedRun.id));

  await db
    .update(snapshots)
    .set({
      status: "staging",
      completedAt: null,
      notes: null,
    })
    .where(eq(snapshots.id, resumableFailedRun.snapshotId));

  return {
    runId: resumableFailedRun.id,
    snapshotId: resumableFailedRun.snapshotId,
    phase: resumableFailedRun.phase,
    phaseCursor: resumableFailedRun.phaseCursor,
    companyPagesProcessed: resumableFailedRun.companyPagesProcessed,
    companyRowsWritten: resumableFailedRun.companyRowsWritten,
    uniqueUsersFetched: resumableFailedRun.uniqueUsersFetched,
  } satisfies ActiveRun;
}

async function createSyncRun(source: "manual" | "scheduled") {
  const db = getDb();

  const [snapshot] = await db
    .insert(snapshots)
    .values({
      source,
      status: "staging",
    })
    .returning({ id: snapshots.id });

  const [syncRun] = await db
    .insert(syncRuns)
    .values({
      snapshotId: snapshot.id,
      status: "running",
      phase: "load_reference_data",
    })
    .returning({ id: syncRuns.id });

  return {
    runId: syncRun.id,
    snapshotId: snapshot.id,
    phase: "load_reference_data",
    phaseCursor: null,
    companyPagesProcessed: 0,
    companyRowsWritten: 0,
    uniqueUsersFetched: 0,
  } satisfies ActiveRun;
}

async function loadReferenceMaps(snapshotId: string) {
  const db = getDb();

  const [countryRows, regionRows] = await Promise.all([
    db.query.countryReference.findMany({
      where: eq(countryReference.snapshotId, snapshotId),
    }),
    db.query.regionReference.findMany({
      where: eq(regionReference.snapshotId, snapshotId),
    }),
  ]);

  return {
    countryById: new Map<string, CountryReferenceRowInput>(
      countryRows.map((country) => [country.countryId, country]),
    ),
    regionById: new Map<string, RegionReferenceRowInput>(
      regionRows.map((region) => [region.regionId, region]),
    ),
  };
}

async function ensureReferenceData(snapshotId: string) {
  const existingReferences = await loadReferenceMaps(snapshotId);

  if (
    existingReferences.countryById.size > 0 &&
    existingReferences.regionById.size > 0
  ) {
    return existingReferences;
  }

  const db = getDb();
  const client = getWareraClient();

  const countries = await client.country.getAllCountries();
  const countryRows = normalizeCountries(snapshotId, countries);
  const countryById = new Map<string, CountryReferenceRowInput>(
    countryRows.map((country) => [country.countryId, country]),
  );

  await db.insert(countryReference).values(countryRows).onConflictDoNothing();

  const regions = await client.region.getRegionsObject();
  const regionRows = normalizeRegions(snapshotId, regions, countryById);
  await db.insert(regionReference).values(regionRows).onConflictDoNothing();

  const hydratedReferences = await loadReferenceMaps(snapshotId);

  if (
    hydratedReferences.countryById.size === 0 ||
    hydratedReferences.regionById.size === 0
  ) {
    throw new Error("Reference data could not be hydrated for the active snapshot.");
  }

  return hydratedReferences;
}

async function loadOwnersFromSnapshot(input: {
  snapshotId: string;
  userIds: string[];
  ownerCache: Map<string, OwnerSnapshotInput>;
}) {
  if (input.userIds.length === 0) {
    return;
  }

  const db = getDb();
  const existingRows = await db.query.companySnapshotRows.findMany({
    where: and(
      eq(companySnapshotRows.snapshotId, input.snapshotId),
      inArray(companySnapshotRows.ownerUserId, input.userIds),
    ),
  });

  for (const row of existingRows) {
    if (input.ownerCache.has(row.ownerUserId)) {
      continue;
    }

    input.ownerCache.set(row.ownerUserId, {
      ownerUserId: row.ownerUserId,
      ownerUsername: row.ownerUsername ?? null,
      ownerCountryId: row.ownerCountryId ?? null,
      ownerCountryCode: row.ownerCountryCode ?? null,
      ownerCountryName: row.ownerCountryName ?? null,
    });
  }
}

async function fetchMissingOwnersFromApi(input: {
  userIds: string[];
  countryById: Map<string, CountryReferenceRowInput>;
  ownerCache: Map<string, OwnerSnapshotInput>;
}) {
  if (input.userIds.length === 0) {
    return 0;
  }

  const client = getWareraClient();
  const users = await Promise.all(
    input.userIds.map((userId) => client.user.getUserLite({ userId })),
  );

  for (const user of users) {
    input.ownerCache.set(user._id, normalizeOwnerSnapshot(user, input.countryById));
  }

  return users.length;
}

async function processCompanyPagesPhase(run: ActiveRun) {
  if (run.phaseCursor === "") {
    return {
      ...run,
      phaseCursor: "",
      passPagesProcessed: 0,
      hasMorePages: false,
    };
  }

  const client = getWareraClient();
  const references = await ensureReferenceData(run.snapshotId);
  const ownerCache = new Map<string, OwnerSnapshotInput>();

  let companyPagesProcessed = run.companyPagesProcessed;
  let companyRowsWritten = run.companyRowsWritten;
  let uniqueUsersFetched = run.uniqueUsersFetched;
  let lastCursor = run.phaseCursor;
  let passPagesProcessed = 0;

  const pageIterator = run.phaseCursor
    ? client.company.getCompanies({
        perPage: 100,
        cursor: run.phaseCursor,
        autoPaginate: true,
        maxPages: SYNC_MAX_PAGES_PER_PASS,
      })
    : client.company.getCompanies({
        perPage: 100,
        autoPaginate: true,
        maxPages: SYNC_MAX_PAGES_PER_PASS,
      });

  for await (const page of pageIterator) {
    passPagesProcessed += 1;
    companyPagesProcessed += 1;
    lastCursor = page.cursor;

    const companies = await Promise.all(
      page.items.map((companyId) => client.company.getById({ companyId })),
    );

    const pageOwnerIds = Array.from(new Set(companies.map((company) => company.user)));
    await loadOwnersFromSnapshot({
      snapshotId: run.snapshotId,
      userIds: pageOwnerIds,
      ownerCache,
    });

    const missingOwnerIds = pageOwnerIds.filter((userId) => !ownerCache.has(userId));
    uniqueUsersFetched += await fetchMissingOwnersFromApi({
      userIds: missingOwnerIds,
      countryById: references.countryById,
      ownerCache,
    });

    const companyRows = companies.map((company) => {
      const owner = ownerCache.get(company.user);

      if (!owner) {
        throw new Error(`Missing owner cache entry for user ${company.user}.`);
      }

      return normalizeCompanySnapshotRow({
        snapshotId: run.snapshotId,
        company,
        regionById: references.regionById,
        owner,
      });
    });

    await bulkInsertCompanies(companyRows);
    companyRowsWritten += companyRows.length;

    await updateRunProgress({
      runId: run.runId,
      phase: "sync_company_pages",
      phaseCursor: lastCursor,
      companyPagesProcessed,
      companyRowsWritten,
      uniqueUsersFetched,
    });
  }

  return {
    runId: run.runId,
    snapshotId: run.snapshotId,
    phase: "sync_company_pages" as const,
    phaseCursor: lastCursor,
    companyPagesProcessed,
    companyRowsWritten,
    uniqueUsersFetched,
    passPagesProcessed,
    hasMorePages: lastCursor !== "",
  };
}

async function deleteSnapshotHotRows(snapshotId: string) {
  const db = getDb();

  await db.transaction(async (tx) => {
    await tx
      .delete(companySnapshotRows)
      .where(eq(companySnapshotRows.snapshotId, snapshotId));
    await tx.delete(countryReference).where(eq(countryReference.snapshotId, snapshotId));
    await tx.delete(regionReference).where(eq(regionReference.snapshotId, snapshotId));
    await tx
      .delete(countryAggregates)
      .where(eq(countryAggregates.snapshotId, snapshotId));
    await tx.delete(regionAggregates).where(eq(regionAggregates.snapshotId, snapshotId));
  });
}

async function getSuccessfulSnapshots() {
  const db = getDb();

  return db.query.snapshots.findMany({
    where: inArray(snapshots.status, ["promoted", "archived"]),
    orderBy: [asc(snapshots.completedAt), asc(snapshots.createdAt)],
  });
}

async function getExistingComparisonPairs() {
  const db = getDb();

  return db.query.snapshotComparisons.findMany({
    orderBy: [
      asc(snapshotComparisons.fromSnapshotCompletedAt),
      asc(snapshotComparisons.toSnapshotCompletedAt),
    ],
  });
}

async function selectFailedSnapshotForPrune(): Promise<string | null> {
  const db = getDb();
  const cutoff = new Date(Date.now() - FAILED_SNAPSHOT_RETENTION_MS);
  const result = await db.execute(sql<{ snapshotId: string }>`
    select s.id as "snapshotId"
    from snapshots as s
    where
      s.status in ('failed', 'staging')
      and s.created_at < ${cutoff}
      and (
        exists (
          select 1
          from company_snapshot_rows csr
          where csr.snapshot_id = s.id
        )
        or exists (
          select 1
          from country_reference cr
          where cr.snapshot_id = s.id
        )
        or exists (
          select 1
          from region_reference rr
          where rr.snapshot_id = s.id
        )
        or exists (
          select 1
          from country_aggregates ca
          where ca.snapshot_id = s.id
        )
        or exists (
          select 1
          from region_aggregates ra
          where ra.snapshot_id = s.id
        )
      )
    order by s.created_at asc
    limit 1
  `);

  const row = result.rows[0] as { snapshotId: string } | undefined;

  return row?.snapshotId ?? null;
}

async function upsertSnapshotArchive(input: {
  snapshotId: string;
  archiveStatus: "pending" | "uploaded" | "pruned" | "failed";
  bucketName?: string | null;
  objectPrefix?: string | null;
  manifestKey?: string | null;
  manifestEtag?: string | null;
  totalBytes?: number | null;
  uploadedAt?: Date | null;
  dbPrunedAt?: Date | null;
  lastError?: string | null;
}) {
  const db = getDb();

  await db
    .insert(snapshotArchives)
    .values({
      snapshotId: input.snapshotId,
      archiveStatus: input.archiveStatus,
      bucketName: input.bucketName ?? null,
      objectPrefix: input.objectPrefix ?? null,
      manifestKey: input.manifestKey ?? null,
      manifestEtag: input.manifestEtag ?? null,
      totalBytes: input.totalBytes ?? null,
      uploadedAt: input.uploadedAt ?? null,
      dbPrunedAt: input.dbPrunedAt ?? null,
      lastError: input.lastError ?? null,
    })
    .onConflictDoUpdate({
      target: snapshotArchives.snapshotId,
      set: {
        archiveStatus: input.archiveStatus,
        bucketName: input.bucketName ?? null,
        objectPrefix: input.objectPrefix ?? null,
        manifestKey: input.manifestKey ?? null,
        manifestEtag: input.manifestEtag ?? null,
        totalBytes: input.totalBytes ?? null,
        uploadedAt: input.uploadedAt ?? null,
        dbPrunedAt: input.dbPrunedAt ?? null,
        lastError: input.lastError ?? null,
      },
    });
}

async function getSnapshotRowCounts(snapshotId: string) {
  const db = getDb();
  const result = await db.execute(sql<{
    countries: number;
    regions: number;
    companies: number;
    countryAggregates: number;
    regionAggregates: number;
  }>`
    select
      (select count(*)::int from country_reference where snapshot_id = ${snapshotId}) as "countries",
      (select count(*)::int from region_reference where snapshot_id = ${snapshotId}) as "regions",
      (select count(*)::int from company_snapshot_rows where snapshot_id = ${snapshotId}) as "companies",
      (select count(*)::int from country_aggregates where snapshot_id = ${snapshotId}) as "countryAggregates",
      (select count(*)::int from region_aggregates where snapshot_id = ${snapshotId}) as "regionAggregates"
  `);

  return (
    (result.rows[0] as
      | {
          countries: number;
          regions: number;
          companies: number;
          countryAggregates: number;
          regionAggregates: number;
        }
      | undefined) ?? {
      countries: 0,
      regions: 0,
      companies: 0,
      countryAggregates: 0,
      regionAggregates: 0,
    }
  );
}

async function* iterateCountryReferenceRows(snapshotId: string) {
  const db = getDb();
  const rows = await db.query.countryReference.findMany({
    where: eq(countryReference.snapshotId, snapshotId),
    orderBy: [asc(countryReference.countryCode)],
  });

  for (const row of rows) {
    yield row;
  }
}

async function* iterateRegionReferenceRows(snapshotId: string) {
  const db = getDb();
  const rows = await db.query.regionReference.findMany({
    where: eq(regionReference.snapshotId, snapshotId),
    orderBy: [asc(regionReference.regionCode)],
  });

  for (const row of rows) {
    yield row;
  }
}

async function* iterateCompanySnapshotRows(snapshotId: string) {
  const db = getDb();
  let lastCompanyId: string | null = null;

  while (true) {
    const rows: Awaited<ReturnType<typeof db.query.companySnapshotRows.findMany>> =
      await db.query.companySnapshotRows.findMany({
      where: lastCompanyId
        ? and(
            eq(companySnapshotRows.snapshotId, snapshotId),
            gt(companySnapshotRows.companyId, lastCompanyId),
          )
        : eq(companySnapshotRows.snapshotId, snapshotId),
      orderBy: [asc(companySnapshotRows.companyId)],
      limit: COMPANY_ARCHIVE_BATCH_SIZE,
      });

    if (rows.length === 0) {
      return;
    }

    for (const row of rows) {
      yield row;
    }

    lastCompanyId = rows[rows.length - 1]!.companyId;
  }
}

async function* iterateCountryAggregateRows(snapshotId: string) {
  const db = getDb();
  const rows = await db.query.countryAggregates.findMany({
    where: eq(countryAggregates.snapshotId, snapshotId),
    orderBy: [asc(countryAggregates.countryCode)],
  });

  for (const row of rows) {
    yield row;
  }
}

async function* iterateRegionAggregateRows(snapshotId: string) {
  const db = getDb();
  const rows = await db.query.regionAggregates.findMany({
    where: eq(regionAggregates.snapshotId, snapshotId),
    orderBy: [asc(regionAggregates.regionCode)],
  });

  for (const row of rows) {
    yield row;
  }
}

async function archiveSnapshotToR2(snapshotId: string) {
  const db = getDb();
  const snapshot = await db.query.snapshots.findFirst({
    where: eq(snapshots.id, snapshotId),
  });

  if (!snapshot?.completedAt) {
    throw new Error("Only completed snapshots can be archived to R2.");
  }

  const latestRun = await db.query.syncRuns.findFirst({
    where: eq(syncRuns.snapshotId, snapshotId),
    orderBy: [desc(syncRuns.startedAt)],
  });
  const rowCounts = await getSnapshotRowCounts(snapshotId);
  const config = getR2ArchiveConfig();
  const objectPrefix = buildArchivePrefix({
    archivePrefix: config.archivePrefix,
    snapshotId,
    completedAt: snapshot.completedAt,
  });

  await upsertSnapshotArchive({
    snapshotId,
    archiveStatus: "pending",
    bucketName: config.bucketName,
    objectPrefix,
    lastError: null,
  });

  try {
    const files: Array<ArchiveObjectResult & { rowCount: number }> = [];

    files.push({
      ...(await uploadGzippedNdjson({
        key: `${objectPrefix}/country-reference.ndjson.gz`,
        rows: iterateCountryReferenceRows(snapshotId),
      })),
      rowCount: rowCounts.countries,
    });

    files.push({
      ...(await uploadGzippedNdjson({
        key: `${objectPrefix}/region-reference.ndjson.gz`,
        rows: iterateRegionReferenceRows(snapshotId),
      })),
      rowCount: rowCounts.regions,
    });

    files.push({
      ...(await uploadGzippedNdjson({
        key: `${objectPrefix}/company-snapshot-rows.ndjson.gz`,
        rows: iterateCompanySnapshotRows(snapshotId),
      })),
      rowCount: rowCounts.companies,
    });

    files.push({
      ...(await uploadGzippedNdjson({
        key: `${objectPrefix}/country-aggregates.ndjson.gz`,
        rows: iterateCountryAggregateRows(snapshotId),
      })),
      rowCount: rowCounts.countryAggregates,
    });

    files.push({
      ...(await uploadGzippedNdjson({
        key: `${objectPrefix}/region-aggregates.ndjson.gz`,
        rows: iterateRegionAggregateRows(snapshotId),
      })),
      rowCount: rowCounts.regionAggregates,
    });

    const manifest: SnapshotArchiveManifest = {
      snapshotId,
      exportedAt: new Date().toISOString(),
      bucketName: config.bucketName,
      objectPrefix,
      snapshot: {
        status: snapshot.status,
        source: snapshot.source,
        createdAt: snapshot.createdAt.toISOString(),
        completedAt: snapshot.completedAt.toISOString(),
        notes: snapshot.notes ?? null,
      },
      syncRun: latestRun
        ? {
            id: latestRun.id,
            status: latestRun.status,
            phase: latestRun.phase,
            companyPagesProcessed: latestRun.companyPagesProcessed,
            companyRowsWritten: latestRun.companyRowsWritten,
            uniqueUsersFetched: latestRun.uniqueUsersFetched,
            startedAt: latestRun.startedAt.toISOString(),
            updatedAt: latestRun.updatedAt.toISOString(),
            finishedAt: latestRun.finishedAt?.toISOString() ?? null,
            errorMessage: latestRun.errorMessage ?? null,
          }
        : null,
      rowCounts,
      files: files.map((file) => ({
        key: file.key,
        sizeBytes: file.sizeBytes,
        etag: file.etag,
        rowCount: file.rowCount,
      })),
    };

    const manifestUpload = await uploadJsonObject({
      key: `${objectPrefix}/manifest.json`,
      content: manifest,
    });

    await upsertSnapshotArchive({
      snapshotId,
      archiveStatus: "uploaded",
      bucketName: config.bucketName,
      objectPrefix,
      manifestKey: `${objectPrefix}/manifest.json`,
      manifestEtag: manifestUpload.etag,
      totalBytes:
        manifestUpload.sizeBytes +
        files.reduce((sum, file) => sum + file.sizeBytes, 0),
      uploadedAt: new Date(),
      lastError: null,
    });
  } catch (error) {
    await upsertSnapshotArchive({
      snapshotId,
      archiveStatus: "failed",
      bucketName: config.bucketName,
      objectPrefix,
      lastError:
        error instanceof Error ? error.message : "Unknown R2 archive failure.",
    });

    throw error;
  }
}

async function pruneArchivedSnapshot(snapshotId: string) {
  await deleteSnapshotHotRows(snapshotId);
  const archiveRow = await getDb().query.snapshotArchives.findFirst({
    where: eq(snapshotArchives.snapshotId, snapshotId),
  });

  await upsertSnapshotArchive({
    snapshotId,
    archiveStatus: "pruned",
    bucketName: archiveRow?.bucketName ?? null,
    objectPrefix: archiveRow?.objectPrefix ?? null,
    manifestKey: archiveRow?.manifestKey ?? null,
    manifestEtag: archiveRow?.manifestEtag ?? null,
    totalBytes: archiveRow?.totalBytes ?? null,
    uploadedAt: archiveRow?.uploadedAt ?? null,
    dbPrunedAt: new Date(),
    lastError: null,
  });
}

function findNextSnapshotId(
  successfulSnapshots: CompletedSnapshot[],
  snapshotId: string,
) {
  const snapshotIndex = successfulSnapshots.findIndex((snapshot) => snapshot.id === snapshotId);

  if (snapshotIndex === -1 || snapshotIndex === successfulSnapshots.length - 1) {
    return null;
  }

  return successfulSnapshots[snapshotIndex + 1]!.id;
}

async function selectArchiveCandidates() {
  const db = getDb();
  const successfulSnapshots = (await getSuccessfulSnapshots()).filter(
    (snapshot): snapshot is typeof snapshot & { completedAt: Date } =>
      Boolean(snapshot.completedAt),
  );

  if (successfulSnapshots.length <= HOT_SUCCESSFUL_SNAPSHOT_COUNT) {
    return {
      uploadCandidate: null,
      pruneCandidate: null,
    };
  }

  const existingPairs = await getExistingComparisonPairs();
  const pairKeys = new Set(
    existingPairs.map((pair) => `${pair.fromSnapshotId}:${pair.toSnapshotId}`),
  );
  const hotSnapshotIds = new Set(
    getHotSuccessfulSnapshotIds(successfulSnapshots, HOT_SUCCESSFUL_SNAPSHOT_COUNT),
  );
  const archiveRows = await db.query.snapshotArchives.findMany();
  const archiveRowBySnapshotId = new Map(
    archiveRows.map((archiveRow) => [archiveRow.snapshotId, archiveRow]),
  );

  let uploadCandidate: typeof successfulSnapshots[number] | null = null;
  let pruneCandidate: typeof successfulSnapshots[number] | null = null;

  for (const snapshot of successfulSnapshots) {
    if (hotSnapshotIds.has(snapshot.id)) {
      continue;
    }

    const nextSnapshotId = findNextSnapshotId(successfulSnapshots, snapshot.id);

    if (!nextSnapshotId || !pairKeys.has(`${snapshot.id}:${nextSnapshotId}`)) {
      continue;
    }

    const archiveRow = archiveRowBySnapshotId.get(snapshot.id);

    if (
      !uploadCandidate &&
      (!archiveRow ||
        archiveRow.archiveStatus === "pending" ||
        archiveRow.archiveStatus === "failed")
    ) {
      uploadCandidate = snapshot;
    }

    if (!pruneCandidate && archiveRow?.archiveStatus === "uploaded") {
      pruneCandidate = snapshot;
    }
  }

  return {
    uploadCandidate,
    pruneCandidate,
  };
}

export async function runSyncPass(source: "manual" | "scheduled" = "manual") {
  const lockResult = await withSyncAdvisoryLock(async () => {
    const startedAt = Date.now();
    await markStaleRuns();

    let activeRun = await getActiveRun();
    const resumedExistingRun = Boolean(activeRun);

    try {
      if (!activeRun) {
        activeRun = await createSyncRun(source);
      }

      if (activeRun.phase === "load_reference_data") {
        await ensureReferenceData(activeRun.snapshotId);
        await updateRunProgress({
          runId: activeRun.runId,
          phase: "sync_company_pages",
          phaseCursor: activeRun.phaseCursor,
          companyPagesProcessed: activeRun.companyPagesProcessed,
          companyRowsWritten: activeRun.companyRowsWritten,
          uniqueUsersFetched: activeRun.uniqueUsersFetched,
        });

        activeRun = {
          ...activeRun,
          phase: "sync_company_pages",
        };
      }

      if (activeRun.phase === "sync_company_pages") {
        const pageResult = await processCompanyPagesPhase(activeRun);

        activeRun = {
          runId: pageResult.runId,
          snapshotId: pageResult.snapshotId,
          phase: "sync_company_pages",
          phaseCursor: pageResult.phaseCursor,
          companyPagesProcessed: pageResult.companyPagesProcessed,
          companyRowsWritten: pageResult.companyRowsWritten,
          uniqueUsersFetched: pageResult.uniqueUsersFetched,
        };

        if (pageResult.hasMorePages) {
          return {
            status: "running" as const,
            summary: buildSummary({
              run: activeRun,
              phase: "sync_company_pages",
              passPagesProcessed: pageResult.passPagesProcessed,
              resumedExistingRun,
              hasMoreWork: true,
              startedAt,
            }),
          };
        }

        await updateRunProgress({
          runId: activeRun.runId,
          phase: "build_aggregates",
          phaseCursor: activeRun.phaseCursor,
          companyPagesProcessed: activeRun.companyPagesProcessed,
          companyRowsWritten: activeRun.companyRowsWritten,
          uniqueUsersFetched: activeRun.uniqueUsersFetched,
        });

        activeRun = {
          ...activeRun,
          phase: "build_aggregates",
        };
      }

      if (activeRun.phase === "build_aggregates") {
        await clearAggregates(activeRun.snapshotId);
        await buildCountryAggregates(activeRun.snapshotId);
        await buildRegionAggregates(activeRun.snapshotId);

        await updateRunProgress({
          runId: activeRun.runId,
          phase: "build_deltas",
          phaseCursor: activeRun.phaseCursor,
          companyPagesProcessed: activeRun.companyPagesProcessed,
          companyRowsWritten: activeRun.companyRowsWritten,
          uniqueUsersFetched: activeRun.uniqueUsersFetched,
        });

        activeRun = {
          ...activeRun,
          phase: "build_deltas",
        };
      }

      if (activeRun.phase === "build_deltas") {
        const previousPromotedSnapshot = await getCurrentPromotedSnapshot();

        if (previousPromotedSnapshot) {
          await buildDeltaPair({
            fromSnapshotId: previousPromotedSnapshot.id,
            toSnapshotId: activeRun.snapshotId,
          });
        }

        await updateRunProgress({
          runId: activeRun.runId,
          phase: "promote_snapshot",
          phaseCursor: activeRun.phaseCursor,
          companyPagesProcessed: activeRun.companyPagesProcessed,
          companyRowsWritten: activeRun.companyRowsWritten,
          uniqueUsersFetched: activeRun.uniqueUsersFetched,
        });

        activeRun = {
          ...activeRun,
          phase: "promote_snapshot",
        };
      }

      await promoteSnapshot(activeRun.snapshotId, activeRun.runId);

      return {
        status: "completed" as const,
        summary: buildSummary({
          run: activeRun,
          phase: "promote_snapshot",
          passPagesProcessed: 0,
          resumedExistingRun,
          hasMoreWork: false,
          startedAt,
        }),
      };
    } catch (error) {
      await failRun({
        snapshotId: activeRun?.snapshotId ?? null,
        runId: activeRun?.runId ?? null,
        error,
      });
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
    status: lockResult.value.status,
    summary: lockResult.value.summary,
  };
}

export async function runCleanupPass() {
  const lockResult = await withSyncAdvisoryLock(async () => {
    const startedAt = Date.now();
    await markStaleRuns();

    const failedSnapshotId = await selectFailedSnapshotForPrune();

    if (failedSnapshotId) {
      await deleteSnapshotHotRows(failedSnapshotId);

      return {
        status: "working" as const,
        summary: buildCleanupSummary("pruned_failed_snapshot", startedAt, {
          snapshotId: failedSnapshotId,
        }),
      };
    }

    const successfulSnapshots = (await getSuccessfulSnapshots()).filter(
      (snapshot): snapshot is typeof snapshot & { completedAt: Date } =>
        Boolean(snapshot.completedAt),
    );
    const existingPairs = await getExistingComparisonPairs();
    const missingPair = findOldestMissingComparisonPair({
      successfulSnapshots,
      existingPairs: existingPairs.map((pair) => ({
        fromSnapshotId: pair.fromSnapshotId,
        toSnapshotId: pair.toSnapshotId,
      })),
    });

    if (missingPair) {
      await buildDeltaPair(missingPair);

      return {
        status: "working" as const,
        summary: buildCleanupSummary("backfilled_snapshot_pair", startedAt, {
          fromSnapshotId: missingPair.fromSnapshotId,
          toSnapshotId: missingPair.toSnapshotId,
        }),
      };
    }

    const { uploadCandidate, pruneCandidate } = await selectArchiveCandidates();

    if (uploadCandidate) {
      await archiveSnapshotToR2(uploadCandidate.id);

      return {
        status: "working" as const,
        summary: buildCleanupSummary("archived_snapshot", startedAt, {
          snapshotId: uploadCandidate.id,
        }),
      };
    }

    if (pruneCandidate) {
      await pruneArchivedSnapshot(pruneCandidate.id);

      return {
        status: "working" as const,
        summary: buildCleanupSummary("pruned_archived_snapshot", startedAt, {
          snapshotId: pruneCandidate.id,
        }),
      };
    }

    return {
      status: "idle" as const,
      summary: null,
    };
  });

  if (!lockResult.acquired) {
    return {
      ok: false as const,
      reason: "sync-already-running",
    };
  }

  return {
    ok: true as const,
    status: lockResult.value.status,
    summary: lockResult.value.summary,
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
