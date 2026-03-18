import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { getDb, hasDatabaseUrl } from "@/lib/db/client";
import {
  appState,
  companySnapshotRows,
  countryAggregates,
  regionAggregates,
  snapshots,
  syncRuns,
} from "@/lib/db/schema";
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

  const latestRun = await db.query.syncRuns.findFirst({
    orderBy: [desc(syncRuns.startedAt)],
  });

  return {
    configured: true as const,
    currentSnapshot,
    latestRun,
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

export async function hasAnyPromotedSnapshot() {
  const snapshotMeta = await getSnapshotMeta();
  return Boolean(snapshotMeta.configured && snapshotMeta.currentSnapshot);
}
