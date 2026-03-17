import "server-only";

import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";

import { getDb, withSyncAdvisoryLock } from "@/lib/db/client";
import {
  appState,
  companySnapshotRows,
  countryAggregates,
  countryReference,
  regionAggregates,
  regionReference,
  snapshots,
  syncRuns,
} from "@/lib/db/schema";
import {
  CURRENT_SNAPSHOT_STATE_KEY,
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

export type SyncSummary = {
  snapshotId: string;
  runId: string;
  phase: "sync_company_pages" | "build_aggregates" | "promote_snapshot";
  companyPagesProcessed: number;
  companyRowsWritten: number;
  uniqueUsersFetched: number;
  passPagesProcessed: number;
  resumedExistingRun: boolean;
  hasMoreWork: boolean;
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
  const run = await db.query.syncRuns.findFirst({
    where: eq(syncRuns.status, "running"),
    orderBy: [desc(syncRuns.startedAt)],
  });

  if (!run) {
    return null;
  }

  return {
    runId: run.id,
    snapshotId: run.snapshotId,
    phase: run.phase,
    phaseCursor: run.phaseCursor,
    companyPagesProcessed: run.companyPagesProcessed,
    companyRowsWritten: run.companyRowsWritten,
    uniqueUsersFetched: run.uniqueUsersFetched,
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
