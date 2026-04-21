import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import {
  type CountryTaxApiResponse,
  type CountryTaxEntry,
  formatUtcHourInput,
} from "@/lib/country-tax";
import { getDb, hasDatabaseUrl } from "@/lib/db/client";
import {
  appState,
  companySnapshotRows,
  countryAggregates,
  itemAggregates,
  itemDeltas,
  regionAggregates,
  snapshotComparisons,
  snapshots,
  syncRuns,
} from "@/lib/db/schema";
import {
  formatSignedDecimal,
} from "@/lib/formatters";
import {
  buildProductOutlook,
  formatItemCodeLabel,
  type ProductAnalyticsRow,
} from "@/lib/products";
import { CURRENT_SNAPSHOT_STATE_KEY } from "@/lib/sync/constants";

export async function getCurrentSnapshotId() {
  if (!hasDatabaseUrl()) {
    return null;
  }

  const db = getDb();

  const stateRow = await db.query.appState.findFirst({
    where: eq(appState.key, CURRENT_SNAPSHOT_STATE_KEY),
  });

  if (stateRow?.value) {
    return stateRow.value;
  }

  const latestSnapshot = await db.query.snapshots.findFirst({
    where: eq(snapshots.status, "promoted"),
    orderBy: [desc(snapshots.completedAt)],
  });

  return latestSnapshot?.id ?? null;
}

export async function getSnapshotMeta() {
  if (!hasDatabaseUrl()) {
    return {
      configured: false as const,
      currentSnapshot: null,
      latestRun: null,
    };
  }

  const db = getDb();
  const currentSnapshotId = await getCurrentSnapshotId();

  const currentSnapshot = currentSnapshotId
    ? await db.query.snapshots.findFirst({
        where: eq(snapshots.id, currentSnapshotId),
      })
    : null;

  const [latestRun] = await db
    .select({
      id: syncRuns.id,
      snapshotId: syncRuns.snapshotId,
      status: syncRuns.status,
      phase: syncRuns.phase,
      phaseCursor: syncRuns.phaseCursor,
      companyPagesProcessed: syncRuns.companyPagesProcessed,
      companyRowsWritten: syncRuns.companyRowsWritten,
      uniqueUsersFetched: syncRuns.uniqueUsersFetched,
      startedAt: syncRuns.startedAt,
      updatedAt: syncRuns.updatedAt,
      finishedAt: syncRuns.finishedAt,
      errorMessage: syncRuns.errorMessage,
    })
    .from(syncRuns)
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);

  return {
    configured: true as const,
    currentSnapshot,
    latestRun,
  };
}

type CountryTaxToolOption = {
  code: string;
  name: string;
};

export async function getCountryTaxToolPageData() {
  const snapshotMeta = await getSnapshotMeta();

  if (!snapshotMeta.configured) {
    return {
      ...snapshotMeta,
      availableCountries: [] as CountryTaxToolOption[],
      availableItemCodes: [] as string[],
      earliestHour: null as string | null,
      latestHour: null as string | null,
    };
  }

  const db = getDb();

  try {
    const [countriesResult, itemCodesResult, boundsResult] = await Promise.all([
      db.execute(sql<CountryTaxToolOption>`
        select
          country_code as "code",
          max(country_name) as "name"
        from country_tax_hourly
        group by country_code
        order by max(country_name) asc
      `),
      db.execute(sql<{ itemCode: string }>`
        select distinct
          item_code as "itemCode"
        from country_tax_hourly
        order by item_code asc
      `),
      db.execute(sql<{ earliestHour: Date | null; latestHour: Date | null }>`
        select
          min(bucket_started_at) as "earliestHour",
          max(bucket_started_at) as "latestHour"
        from country_tax_hourly
      `),
    ]);

    const bounds = boundsResult.rows[0] as
      | {
          earliestHour: Date | null;
          latestHour: Date | null;
        }
      | undefined;

    return {
      ...snapshotMeta,
      availableCountries: countriesResult.rows as CountryTaxToolOption[],
      availableItemCodes: (itemCodesResult.rows as Array<{ itemCode: string }>).map(
        (row) => row.itemCode,
      ),
      earliestHour: bounds?.earliestHour ? formatUtcHourInput(bounds.earliestHour) : null,
      latestHour: bounds?.latestHour ? formatUtcHourInput(bounds.latestHour) : null,
    };
  } catch (error) {
    if (!isMissingRelationError(error)) {
      throw error;
    }

    return {
      ...snapshotMeta,
      availableCountries: [] as CountryTaxToolOption[],
      availableItemCodes: [] as string[],
      earliestHour: null as string | null,
      latestHour: null as string | null,
    };
  }
}

export async function getCountryTaxRangeData(input: {
  countryCode: string;
  fromHour: Date;
  toHour: Date;
  itemCode?: string | null;
}): Promise<CountryTaxApiResponse> {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const db = getDb();
  const countryCode = input.countryCode.trim().toLowerCase();

  try {
    const [countryResult, entriesResult] = await Promise.all([
      db.execute(sql<{ countryName: string | null }>`
        select
          max(country_name) as "countryName"
        from country_tax_hourly
        where country_code = ${countryCode}
      `),
      input.itemCode
        ? db.execute(sql<CountryTaxEntry>`
            select
              region_id as "regionId",
              max(region_name) as "regionName",
              owner_country_id as "ownerCountryId",
              max(owner_country_code) as "ownerCountryCode",
              max(owner_country_name) as "ownerCountryName",
              item_code as "itemCode",
              core as "core",
              coalesce(sum(wages_paid), 0)::double precision as "wagesPaid",
              coalesce(sum(tax_income), 0)::double precision as "taxIncome",
              case
                when coalesce(sum(wages_paid), 0) > 0
                  then (
                    coalesce(sum(tax_income), 0) / coalesce(sum(wages_paid), 0) * 100
                  )::double precision
                else max(tax_rate)::double precision
              end as "taxRate",
              coalesce(sum(company_observations), 0)::int as "companyObservations"
            from country_tax_hourly
            where
              country_code = ${countryCode}
              and bucket_started_at >= ${input.fromHour}
              and bucket_started_at < ${input.toHour}
              and item_code = ${input.itemCode}
            group by region_id, owner_country_id, item_code, core
            order by
              coalesce(sum(tax_income), 0) desc,
              max(region_name) asc,
              item_code asc
          `)
        : db.execute(sql<CountryTaxEntry>`
            select
              region_id as "regionId",
              max(region_name) as "regionName",
              owner_country_id as "ownerCountryId",
              max(owner_country_code) as "ownerCountryCode",
              max(owner_country_name) as "ownerCountryName",
              item_code as "itemCode",
              core as "core",
              coalesce(sum(wages_paid), 0)::double precision as "wagesPaid",
              coalesce(sum(tax_income), 0)::double precision as "taxIncome",
              case
                when coalesce(sum(wages_paid), 0) > 0
                  then (
                    coalesce(sum(tax_income), 0) / coalesce(sum(wages_paid), 0) * 100
                  )::double precision
                else max(tax_rate)::double precision
              end as "taxRate",
              coalesce(sum(company_observations), 0)::int as "companyObservations"
            from country_tax_hourly
            where
              country_code = ${countryCode}
              and bucket_started_at >= ${input.fromHour}
              and bucket_started_at < ${input.toHour}
            group by region_id, owner_country_id, item_code, core
            order by
              coalesce(sum(tax_income), 0) desc,
              max(region_name) asc,
              item_code asc
          `),
    ]);

    const country = countryResult.rows[0] as { countryName: string | null } | undefined;

    return {
      countryCode,
      countryName: country?.countryName ?? null,
      fromHour: formatUtcHourInput(input.fromHour),
      toHour: formatUtcHourInput(input.toHour),
      entries: entriesResult.rows as CountryTaxEntry[],
    };
  } catch (error) {
    if (!isMissingRelationError(error)) {
      throw error;
    }

    return {
      countryCode,
      countryName: null,
      fromHour: formatUtcHourInput(input.fromHour),
      toHour: formatUtcHourInput(input.toHour),
      entries: [],
    };
  }
}

type ProductMetricRow = {
  itemCode: string;
  companyCount: number;
  totalWorkers: number;
  totalProduction: number;
};

type ProductsOutlookState =
  | {
      status: "available";
      message: string;
      pairMaps: Array<
        Map<
          string,
          {
            companyCountDelta: number;
            workersDelta: number;
            productionDelta: number;
          }
        >
      >;
    }
  | {
      status: "insufficient_history";
      message: string;
    };

function isMissingRelationError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const cause = error.cause as { code?: string; message?: string } | undefined;

  return cause?.code === "42P01" || /relation .* does not exist/i.test(error.message);
}

async function getCurrentProductMetrics(snapshotId: string) {
  const db = getDb();
  try {
    const aggregateRows = await db.query.itemAggregates.findMany({
      where: eq(itemAggregates.snapshotId, snapshotId),
      orderBy: [desc(itemAggregates.companyCount), asc(itemAggregates.itemCode)],
    });

    if (aggregateRows.length > 0) {
      return aggregateRows.map((row) => ({
        itemCode: row.itemCode,
        companyCount: row.companyCount,
        totalWorkers: row.totalWorkers,
        totalProduction: row.totalProduction,
      })) satisfies ProductMetricRow[];
    }
  } catch (error) {
    if (!isMissingRelationError(error)) {
      throw error;
    }
  }

  const result = await db.execute(sql<ProductMetricRow>`
    select
      item_code as "itemCode",
      count(*)::int as "companyCount",
      coalesce(sum(worker_count), 0)::int as "totalWorkers",
      coalesce(sum(production), 0)::double precision as "totalProduction"
    from company_snapshot_rows
    where snapshot_id = ${snapshotId} and item_code is not null
    group by item_code
    order by count(*) desc, item_code asc
  `);

  return result.rows as ProductMetricRow[];
}

async function getUncodedCompaniesCount(snapshotId: string) {
  const db = getDb();
  const result = await db.execute(sql<{ uncodedCompaniesCount: number }>`
    select
      count(*)::int as "uncodedCompaniesCount"
    from company_snapshot_rows
    where snapshot_id = ${snapshotId} and item_code is null
  `);

  return (result.rows[0] as { uncodedCompaniesCount: number } | undefined)
    ?.uncodedCompaniesCount ?? 0;
}

async function getLatestItemDeltaMap(snapshotId: string) {
  const db = getDb();
  try {
    const latestComparison = await db.query.snapshotComparisons.findFirst({
      where: eq(snapshotComparisons.toSnapshotId, snapshotId),
      orderBy: [
        desc(snapshotComparisons.toSnapshotCompletedAt),
        desc(snapshotComparisons.fromSnapshotCompletedAt),
      ],
    });

    if (!latestComparison) {
      return null;
    }

    const rows = await db.query.itemDeltas.findMany({
      where: and(
        eq(itemDeltas.fromSnapshotId, latestComparison.fromSnapshotId),
        eq(itemDeltas.toSnapshotId, latestComparison.toSnapshotId),
      ),
    });

    if (rows.length === 0) {
      return null;
    }

    return new Map(rows.map((row) => [row.itemCode, row]));
  } catch (error) {
    if (!isMissingRelationError(error)) {
      throw error;
    }

    return null;
  }
}

async function getProductsOutlookState(input: {
  currentSnapshotId: string;
  currentSnapshotCompletedAt: Date | null;
}): Promise<ProductsOutlookState> {
  if (!input.currentSnapshotCompletedAt) {
    return {
      status: "insufficient_history",
      message: "Premalo povijesti za outlook.",
    };
  }

  const db = getDb();
  const snapshotsResult = await db.execute(sql<{
    id: string;
    completedAt: Date;
  }>`
    select
      id,
      completed_at as "completedAt"
    from snapshots
    where
      status in ('promoted', 'archived')
      and completed_at is not null
      and completed_at <= ${input.currentSnapshotCompletedAt}
    order by completed_at desc
    limit 4
  `);
  const chain = [
    ...(snapshotsResult.rows as Array<{
      id: string;
      completedAt: Date;
    }>),
  ].reverse();

  if (chain.length < 4 || chain[chain.length - 1]?.id !== input.currentSnapshotId) {
    return {
      status: "insufficient_history",
      message: "Premalo povijesti za outlook.",
    };
  }

  const pairs = chain.slice(0, -1).map((snapshot, index) => ({
    fromSnapshotId: snapshot.id,
    toSnapshotId: chain[index + 1]!.id,
  }));

  const comparisons = await Promise.all(
    pairs.map((pair) =>
      db.query.snapshotComparisons.findFirst({
        where: and(
          eq(snapshotComparisons.fromSnapshotId, pair.fromSnapshotId),
          eq(snapshotComparisons.toSnapshotId, pair.toSnapshotId),
        ),
      }),
    ),
  );

  if (comparisons.some((comparison) => !comparison)) {
    return {
      status: "insufficient_history",
      message: "Premalo povijesti za outlook.",
    };
  }

  const deltaRows = await Promise.all(
    pairs.map(async (pair) => {
      try {
        return await db.query.itemDeltas.findMany({
          where: and(
            eq(itemDeltas.fromSnapshotId, pair.fromSnapshotId),
            eq(itemDeltas.toSnapshotId, pair.toSnapshotId),
          ),
        });
      } catch (error) {
        if (!isMissingRelationError(error)) {
          throw error;
        }

        return [];
      }
    }),
  );

  if (deltaRows.some((rows) => rows.length === 0)) {
    return {
      status: "insufficient_history",
      message: "Premalo povijesti za outlook.",
    };
  }

  return {
    status: "available",
    message: "Outlook koristi zadnja 3 uzastopna para snapshota.",
    pairMaps: deltaRows.map((rows) => {
      const byItemCode = new Map<
        string,
        {
          companyCountDelta: number;
          workersDelta: number;
          productionDelta: number;
        }
      >();

      for (const row of rows) {
        byItemCode.set(row.itemCode, {
          companyCountDelta: row.companyCountDelta,
          workersDelta: row.workersDelta,
          productionDelta: row.productionDelta,
        });
      }

      return byItemCode;
    }),
  };
}

export async function getDashboardData() {
  const snapshotMeta = await getSnapshotMeta();

  if (!snapshotMeta.configured || !snapshotMeta.currentSnapshot) {
    return {
      ...snapshotMeta,
      metrics: null,
      topCountries: [],
      topRegions: [],
    };
  }

  const db = getDb();
  const snapshotId = snapshotMeta.currentSnapshot.id;

  const [totalsResult, topCountries, topRegions] = await Promise.all([
    db.execute(sql<{
      totalCompanies: number;
      countriesWithCompanies: number;
      regionsWithCompanies: number;
      uniqueOwnerCountries: number;
      domesticOwnedTotal: number;
      foreignOwnedTotal: number;
    }>`
      select
        (select count(*)::int from company_snapshot_rows where snapshot_id = ${snapshotId}) as "totalCompanies",
        (select count(*)::int from country_aggregates where snapshot_id = ${snapshotId} and company_count > 0) as "countriesWithCompanies",
        (select count(*)::int from region_aggregates where snapshot_id = ${snapshotId} and company_count > 0) as "regionsWithCompanies",
        (select count(distinct owner_country_code)::int from company_snapshot_rows where snapshot_id = ${snapshotId} and owner_country_code is not null) as "uniqueOwnerCountries",
        (select coalesce(sum(domestic_owned_count), 0)::int from country_aggregates where snapshot_id = ${snapshotId}) as "domesticOwnedTotal",
        (select coalesce(sum(foreign_owned_count), 0)::int from country_aggregates where snapshot_id = ${snapshotId}) as "foreignOwnedTotal"
    `),
    db.query.countryAggregates.findMany({
      where: eq(countryAggregates.snapshotId, snapshotId),
      orderBy: [desc(countryAggregates.companyCount), asc(countryAggregates.countryName)],
      limit: 10,
    }),
    db.query.regionAggregates.findMany({
      where: eq(regionAggregates.snapshotId, snapshotId),
      orderBy: [desc(regionAggregates.companyCount), asc(regionAggregates.regionName)],
      limit: 10,
    }),
  ]);

  const metrics = totalsResult.rows[0] as
    | {
        totalCompanies: number;
        countriesWithCompanies: number;
        regionsWithCompanies: number;
        uniqueOwnerCountries: number;
        domesticOwnedTotal: number;
        foreignOwnedTotal: number;
      }
    | undefined;

  return {
    ...snapshotMeta,
    metrics: metrics ?? null,
    topCountries,
    topRegions,
  };
}

export async function getCountriesPageData() {
  const snapshotMeta = await getSnapshotMeta();

  if (!snapshotMeta.configured || !snapshotMeta.currentSnapshot) {
    return {
      ...snapshotMeta,
      countries: [],
    };
  }

  const db = getDb();

  const countries = await db.query.countryAggregates.findMany({
    where: eq(countryAggregates.snapshotId, snapshotMeta.currentSnapshot.id),
    orderBy: [desc(countryAggregates.companyCount), asc(countryAggregates.countryName)],
  });

  return {
    ...snapshotMeta,
    countries,
  };
}

export async function getCountryDetailData(countryCode: string) {
  const snapshotMeta = await getSnapshotMeta();

  if (!snapshotMeta.configured || !snapshotMeta.currentSnapshot) {
    return {
      ...snapshotMeta,
      country: null,
      regions: [],
      companies: [],
    };
  }

  const db = getDb();
  const snapshotId = snapshotMeta.currentSnapshot.id;

  const [country, regions, companies] = await Promise.all([
    db.query.countryAggregates.findFirst({
      where: and(
        eq(countryAggregates.snapshotId, snapshotId),
        eq(countryAggregates.countryCode, countryCode),
      ),
    }),
    db.query.regionAggregates.findMany({
      where: and(
        eq(regionAggregates.snapshotId, snapshotId),
        eq(regionAggregates.countryCode, countryCode),
      ),
      orderBy: [desc(regionAggregates.companyCount), asc(regionAggregates.regionName)],
    }),
    db.query.companySnapshotRows.findMany({
      where: and(
        eq(companySnapshotRows.snapshotId, snapshotId),
        eq(companySnapshotRows.countryCode, countryCode),
      ),
      orderBy: [asc(companySnapshotRows.regionName), asc(companySnapshotRows.companyName)],
      limit: 50,
    }),
  ]);

  return {
    ...snapshotMeta,
    country,
    regions,
    companies,
  };
}

export async function getRegionsPageData(countryCode?: string) {
  const snapshotMeta = await getSnapshotMeta();

  if (!snapshotMeta.configured || !snapshotMeta.currentSnapshot) {
    return {
      ...snapshotMeta,
      regions: [],
      availableCountries: [],
    };
  }

  const db = getDb();
  const snapshotId = snapshotMeta.currentSnapshot.id;

  const [regions, allCountries] = await Promise.all([
    db.query.regionAggregates.findMany({
      where: countryCode
        ? and(eq(regionAggregates.snapshotId, snapshotId), eq(regionAggregates.countryCode, countryCode))
        : eq(regionAggregates.snapshotId, snapshotId),
      orderBy: [desc(regionAggregates.companyCount), asc(regionAggregates.regionName)],
    }),
    db.query.countryAggregates.findMany({
      where: eq(countryAggregates.snapshotId, snapshotId),
      orderBy: [asc(countryAggregates.countryName)],
      columns: { countryCode: true, countryName: true },
    }),
  ]);

  return {
    ...snapshotMeta,
    regions,
    availableCountries: allCountries.map((c) => ({ code: c.countryCode, name: c.countryName })),
  };
}

export async function getRegionDetailData(regionCode: string) {
  const snapshotMeta = await getSnapshotMeta();

  if (!snapshotMeta.configured || !snapshotMeta.currentSnapshot) {
    return {
      ...snapshotMeta,
      region: null,
      companies: [],
    };
  }

  const db = getDb();
  const snapshotId = snapshotMeta.currentSnapshot.id;

  const [region, companies] = await Promise.all([
    db.query.regionAggregates.findFirst({
      where: and(
        eq(regionAggregates.snapshotId, snapshotId),
        eq(regionAggregates.regionCode, regionCode),
      ),
    }),
    db.query.companySnapshotRows.findMany({
      where: and(
        eq(companySnapshotRows.snapshotId, snapshotId),
        eq(companySnapshotRows.regionCode, regionCode),
      ),
      orderBy: [asc(companySnapshotRows.companyName)],
      limit: 100,
    }),
  ]);

  return {
    ...snapshotMeta,
    region,
    companies,
  };
}

export async function getProductsPageData() {
  const snapshotMeta = await getSnapshotMeta();

  if (!snapshotMeta.configured || !snapshotMeta.currentSnapshot) {
    return {
      ...snapshotMeta,
      products: [] as ProductAnalyticsRow[],
      uncodedCompaniesCount: 0,
      outlookState: {
        status: "insufficient_history" as const,
        message: "Premalo povijesti za outlook.",
      },
    };
  }

  const snapshotId = snapshotMeta.currentSnapshot.id;
  const [productMetrics, uncodedCompaniesCount, latestDeltaMap, outlookState] =
    await Promise.all([
      getCurrentProductMetrics(snapshotId),
      getUncodedCompaniesCount(snapshotId),
      getLatestItemDeltaMap(snapshotId),
      getProductsOutlookState({
        currentSnapshotId: snapshotMeta.currentSnapshot.id,
        currentSnapshotCompletedAt: snapshotMeta.currentSnapshot.completedAt ?? null,
      }),
    ]);

  const products = productMetrics.map((product) => {
    const latestDelta = latestDeltaMap?.get(product.itemCode) ?? null;
    const outlook =
      outlookState.status === "available"
        ? buildProductOutlook(
            outlookState.pairMaps.map(
              (pairMap) =>
                pairMap.get(product.itemCode) ?? {
                  companyCountDelta: 0,
                  workersDelta: 0,
                  productionDelta: 0,
                },
            ),
          )
        : null;

    return {
      itemCode: product.itemCode,
      displayLabel: formatItemCodeLabel(product.itemCode),
      companyCount: product.companyCount,
      totalWorkers: product.totalWorkers,
      totalProduction: product.totalProduction,
      companyCountDelta: latestDelta?.companyCountDelta ?? null,
      workersDelta: latestDelta?.workersDelta ?? null,
      productionDelta: latestDelta?.productionDelta ?? null,
      outlookLabel: outlook?.label ?? null,
      outlookConfidence: outlook?.confidence ?? null,
      outlookSummary: outlook
        ? `Prosjek 3 para: ${formatSignedDecimal(outlook.averageCompanyCountDelta)} firmi, ${formatSignedDecimal(outlook.averageWorkersDelta)} workersa, ${formatSignedDecimal(outlook.averageProductionDelta)} productiona`
        : null,
    } satisfies ProductAnalyticsRow;
  });

  return {
    ...snapshotMeta,
    products,
    uncodedCompaniesCount,
    outlookState: {
      status: outlookState.status,
      message: outlookState.message,
    },
  };
}

export async function hasAnyPromotedSnapshot() {
  const snapshotMeta = await getSnapshotMeta();
  return Boolean(snapshotMeta.configured && snapshotMeta.currentSnapshot);
}
