import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const snapshotStatusEnum = pgEnum("snapshot_status", [
  "staging",
  "promoted",
  "failed",
  "archived",
]);

export const snapshotSourceEnum = pgEnum("snapshot_source", [
  "scheduled",
  "manual",
]);

export const syncRunStatusEnum = pgEnum("sync_run_status", [
  "running",
  "completed",
  "failed",
  "stale",
]);

export const syncPhaseEnum = pgEnum("sync_phase", [
  "load_reference_data",
  "sync_company_pages",
  "build_aggregates",
  "build_deltas",
  "promote_snapshot",
]);

export const snapshotArchiveStatusEnum = pgEnum("snapshot_archive_status", [
  "pending",
  "uploaded",
  "pruned",
  "failed",
]);

export const snapshots = pgTable("snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  status: snapshotStatusEnum("status").default("staging").notNull(),
  source: snapshotSourceEnum("source").default("scheduled").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  notes: text("notes"),
});

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    snapshotId: uuid("snapshot_id")
      .references(() => snapshots.id, { onDelete: "cascade" })
      .notNull(),
    status: syncRunStatusEnum("status").default("running").notNull(),
    holderId: text("holder_id"),
    phase: syncPhaseEnum("phase").default("load_reference_data").notNull(),
    phaseCursor: text("phase_cursor"),
    companyPagesProcessed: integer("company_pages_processed").default(0).notNull(),
    companyRowsWritten: integer("company_rows_written").default(0).notNull(),
    uniqueUsersFetched: integer("unique_users_fetched").default(0).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    errorMessage: text("error_message"),
  },
  (table) => [index("sync_runs_status_updated_idx").on(table.status, table.updatedAt)],
);

export const syncLocks = pgTable("sync_locks", {
  lockName: text("lock_name").primaryKey(),
  holderId: text("holder_id").notNull(),
  acquiredAt: timestamp("acquired_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const countryReference = pgTable(
  "country_reference",
  {
    snapshotId: uuid("snapshot_id")
      .references(() => snapshots.id, { onDelete: "cascade" })
      .notNull(),
    countryId: text("country_id").notNull(),
    countryCode: text("country_code").notNull(),
    countryName: text("country_name").notNull(),
    incomeTax: doublePrecision("income_tax").notNull(),
    marketTax: doublePrecision("market_tax").notNull(),
    selfWorkTax: doublePrecision("self_work_tax").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.countryId] }),
    index("country_reference_snapshot_code_idx").on(table.snapshotId, table.countryCode),
  ],
);

export const regionReference = pgTable(
  "region_reference",
  {
    snapshotId: uuid("snapshot_id")
      .references(() => snapshots.id, { onDelete: "cascade" })
      .notNull(),
    regionId: text("region_id").notNull(),
    regionCode: text("region_code").notNull(),
    regionName: text("region_name").notNull(),
    countryId: text("country_id").notNull(),
    countryCode: text("country_code").notNull(),
    countryName: text("country_name").notNull(),
    development: doublePrecision("development"),
    mainCity: text("main_city"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.regionId] }),
    index("region_reference_snapshot_code_idx").on(table.snapshotId, table.regionCode),
    index("region_reference_snapshot_country_code_idx").on(
      table.snapshotId,
      table.countryCode,
    ),
  ],
);

export const companySnapshotRows = pgTable(
  "company_snapshot_rows",
  {
    snapshotId: uuid("snapshot_id")
      .references(() => snapshots.id, { onDelete: "cascade" })
      .notNull(),
    companyId: text("company_id").notNull(),
    companyName: text("company_name").notNull(),
    itemCode: text("item_code"),
    regionId: text("region_id").notNull(),
    regionCode: text("region_code").notNull(),
    regionName: text("region_name").notNull(),
    countryId: text("country_id").notNull(),
    countryCode: text("country_code").notNull(),
    countryName: text("country_name").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    ownerUsername: text("owner_username"),
    ownerCountryId: text("owner_country_id"),
    ownerCountryCode: text("owner_country_code"),
    ownerCountryName: text("owner_country_name"),
    workerCount: integer("worker_count"),
    estimatedValue: doublePrecision("estimated_value"),
    production: doublePrecision("production"),
    isFull: boolean("is_full"),
    wareraUpdatedAt: timestamp("warera_updated_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.companyId] }),
    index("company_snapshot_rows_snapshot_region_code_idx").on(
      table.snapshotId,
      table.regionCode,
    ),
    index("company_snapshot_rows_snapshot_country_code_idx").on(
      table.snapshotId,
      table.countryCode,
    ),
    index("company_snapshot_rows_snapshot_owner_country_code_idx").on(
      table.snapshotId,
      table.ownerCountryCode,
    ),
    index("company_snapshot_rows_snapshot_owner_user_idx").on(
      table.snapshotId,
      table.ownerUserId,
    ),
    index("company_snapshot_rows_snapshot_item_code_idx").on(
      table.snapshotId,
      table.itemCode,
    ),
  ],
);

export const countryAggregates = pgTable(
  "country_aggregates",
  {
    snapshotId: uuid("snapshot_id")
      .references(() => snapshots.id, { onDelete: "cascade" })
      .notNull(),
    countryId: text("country_id").notNull(),
    countryCode: text("country_code").notNull(),
    countryName: text("country_name").notNull(),
    incomeTax: doublePrecision("income_tax").notNull(),
    marketTax: doublePrecision("market_tax").notNull(),
    selfWorkTax: doublePrecision("self_work_tax").notNull(),
    companyCount: integer("company_count").notNull(),
    regionsWithCompanies: integer("regions_with_companies").notNull(),
    domesticOwnedCount: integer("domestic_owned_count").notNull(),
    foreignOwnedCount: integer("foreign_owned_count").notNull(),
    uniqueOwnerCountries: integer("unique_owner_countries").notNull(),
    topOwnerCountryCode: text("top_owner_country_code"),
    topOwnerCountryName: text("top_owner_country_name"),
    topOwnerCountryCompanyCount: integer("top_owner_country_company_count").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.countryId] }),
    index("country_aggregates_snapshot_code_idx").on(table.snapshotId, table.countryCode),
    index("country_aggregates_snapshot_company_count_idx").on(
      table.snapshotId,
      table.companyCount,
    ),
  ],
);

export const regionAggregates = pgTable(
  "region_aggregates",
  {
    snapshotId: uuid("snapshot_id")
      .references(() => snapshots.id, { onDelete: "cascade" })
      .notNull(),
    regionId: text("region_id").notNull(),
    regionCode: text("region_code").notNull(),
    regionName: text("region_name").notNull(),
    countryId: text("country_id").notNull(),
    countryCode: text("country_code").notNull(),
    countryName: text("country_name").notNull(),
    incomeTax: doublePrecision("income_tax").notNull(),
    development: doublePrecision("development"),
    companyCount: integer("company_count").notNull(),
    domesticOwnedCount: integer("domestic_owned_count").notNull(),
    foreignOwnedCount: integer("foreign_owned_count").notNull(),
    uniqueOwnerCountries: integer("unique_owner_countries").notNull(),
    topOwnerCountryCode: text("top_owner_country_code"),
    topOwnerCountryName: text("top_owner_country_name"),
    topOwnerCountryCompanyCount: integer("top_owner_country_company_count").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.regionId] }),
    index("region_aggregates_snapshot_code_idx").on(table.snapshotId, table.regionCode),
    index("region_aggregates_snapshot_country_code_idx").on(
      table.snapshotId,
      table.countryCode,
    ),
    index("region_aggregates_snapshot_company_count_idx").on(
      table.snapshotId,
      table.companyCount,
    ),
  ],
);

export const itemAggregates = pgTable(
  "item_aggregates",
  {
    snapshotId: uuid("snapshot_id")
      .references(() => snapshots.id, { onDelete: "cascade" })
      .notNull(),
    itemCode: text("item_code").notNull(),
    companyCount: integer("company_count").notNull(),
    totalWorkers: integer("total_workers").notNull(),
    totalProduction: doublePrecision("total_production").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.itemCode] }),
    index("item_aggregates_snapshot_company_count_idx").on(
      table.snapshotId,
      table.companyCount,
    ),
  ],
);

export const snapshotComparisons = pgTable(
  "snapshot_comparisons",
  {
    fromSnapshotId: uuid("from_snapshot_id")
      .references(() => snapshots.id, { onDelete: "cascade" })
      .notNull(),
    toSnapshotId: uuid("to_snapshot_id")
      .references(() => snapshots.id, { onDelete: "cascade" })
      .notNull(),
    fromSnapshotCompletedAt: timestamp("from_snapshot_completed_at", {
      withTimezone: true,
    }).notNull(),
    toSnapshotCompletedAt: timestamp("to_snapshot_completed_at", {
      withTimezone: true,
    }).notNull(),
    newCompaniesCount: integer("new_companies_count").notNull(),
    deletedCompaniesCount: integer("deleted_companies_count").notNull(),
    regionMovedCount: integer("region_moved_count").notNull(),
    countryMovedCount: integer("country_moved_count").notNull(),
    ownerCountryChangedCount: integer("owner_country_changed_count").notNull(),
    deltaBuildCompletedAt: timestamp("delta_build_completed_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.fromSnapshotId, table.toSnapshotId] }),
    index("snapshot_comparisons_to_snapshot_idx").on(table.toSnapshotId),
  ],
);

export const companyDeltas = pgTable(
  "company_deltas",
  {
    fromSnapshotId: uuid("from_snapshot_id")
      .references(() => snapshots.id, { onDelete: "cascade" })
      .notNull(),
    toSnapshotId: uuid("to_snapshot_id")
      .references(() => snapshots.id, { onDelete: "cascade" })
      .notNull(),
    companyId: text("company_id").notNull(),
    existsInFrom: boolean("exists_in_from").notNull(),
    existsInTo: boolean("exists_in_to").notNull(),
    fromRegionId: text("from_region_id"),
    toRegionId: text("to_region_id"),
    fromCountryId: text("from_country_id"),
    toCountryId: text("to_country_id"),
    fromOwnerCountryId: text("from_owner_country_id"),
    toOwnerCountryId: text("to_owner_country_id"),
    regionChanged: boolean("region_changed").notNull(),
    countryChanged: boolean("country_changed").notNull(),
    ownerCountryChanged: boolean("owner_country_changed").notNull(),
    workerCountDelta: integer("worker_count_delta"),
    estimatedValueDelta: doublePrecision("estimated_value_delta"),
    productionDelta: doublePrecision("production_delta"),
  },
  (table) => [
    primaryKey({
      columns: [table.fromSnapshotId, table.toSnapshotId, table.companyId],
    }),
    index("company_deltas_company_to_snapshot_idx").on(
      table.companyId,
      table.toSnapshotId,
    ),
  ],
);

export const countryDeltas = pgTable(
  "country_deltas",
  {
    fromSnapshotId: uuid("from_snapshot_id")
      .references(() => snapshots.id, { onDelete: "cascade" })
      .notNull(),
    toSnapshotId: uuid("to_snapshot_id")
      .references(() => snapshots.id, { onDelete: "cascade" })
      .notNull(),
    countryId: text("country_id").notNull(),
    countryCode: text("country_code").notNull(),
    countryName: text("country_name").notNull(),
    fromCompanyCount: integer("from_company_count").notNull(),
    toCompanyCount: integer("to_company_count").notNull(),
    companyCountDelta: integer("company_count_delta").notNull(),
    regionsWithCompaniesDelta: integer("regions_with_companies_delta").notNull(),
    domesticOwnedDelta: integer("domestic_owned_delta").notNull(),
    foreignOwnedDelta: integer("foreign_owned_delta").notNull(),
    uniqueOwnerCountriesDelta: integer("unique_owner_countries_delta").notNull(),
    gainedCompaniesCount: integer("gained_companies_count").notNull(),
    lostCompaniesCount: integer("lost_companies_count").notNull(),
    fromIncomeTax: doublePrecision("from_income_tax"),
    toIncomeTax: doublePrecision("to_income_tax"),
    incomeTaxDelta: doublePrecision("income_tax_delta"),
    fromMarketTax: doublePrecision("from_market_tax"),
    toMarketTax: doublePrecision("to_market_tax"),
    marketTaxDelta: doublePrecision("market_tax_delta"),
    fromSelfWorkTax: doublePrecision("from_self_work_tax"),
    toSelfWorkTax: doublePrecision("to_self_work_tax"),
    selfWorkTaxDelta: doublePrecision("self_work_tax_delta"),
  },
  (table) => [
    primaryKey({ columns: [table.fromSnapshotId, table.toSnapshotId, table.countryId] }),
    index("country_deltas_pair_country_code_idx").on(
      table.fromSnapshotId,
      table.toSnapshotId,
      table.countryCode,
    ),
  ],
);

export const regionDeltas = pgTable(
  "region_deltas",
  {
    fromSnapshotId: uuid("from_snapshot_id")
      .references(() => snapshots.id, { onDelete: "cascade" })
      .notNull(),
    toSnapshotId: uuid("to_snapshot_id")
      .references(() => snapshots.id, { onDelete: "cascade" })
      .notNull(),
    regionId: text("region_id").notNull(),
    regionCode: text("region_code").notNull(),
    regionName: text("region_name").notNull(),
    countryId: text("country_id").notNull(),
    countryCode: text("country_code").notNull(),
    countryName: text("country_name").notNull(),
    fromCompanyCount: integer("from_company_count").notNull(),
    toCompanyCount: integer("to_company_count").notNull(),
    companyCountDelta: integer("company_count_delta").notNull(),
    domesticOwnedDelta: integer("domestic_owned_delta").notNull(),
    foreignOwnedDelta: integer("foreign_owned_delta").notNull(),
    uniqueOwnerCountriesDelta: integer("unique_owner_countries_delta").notNull(),
    gainedCompaniesCount: integer("gained_companies_count").notNull(),
    lostCompaniesCount: integer("lost_companies_count").notNull(),
    netFlow: integer("net_flow").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.fromSnapshotId, table.toSnapshotId, table.regionId] }),
    index("region_deltas_pair_region_code_idx").on(
      table.fromSnapshotId,
      table.toSnapshotId,
      table.regionCode,
    ),
  ],
);

export const itemDeltas = pgTable(
  "item_deltas",
  {
    fromSnapshotId: uuid("from_snapshot_id")
      .references(() => snapshots.id, { onDelete: "cascade" })
      .notNull(),
    toSnapshotId: uuid("to_snapshot_id")
      .references(() => snapshots.id, { onDelete: "cascade" })
      .notNull(),
    itemCode: text("item_code").notNull(),
    fromCompanyCount: integer("from_company_count").notNull(),
    toCompanyCount: integer("to_company_count").notNull(),
    companyCountDelta: integer("company_count_delta").notNull(),
    fromTotalWorkers: integer("from_total_workers").notNull(),
    toTotalWorkers: integer("to_total_workers").notNull(),
    workersDelta: integer("workers_delta").notNull(),
    fromTotalProduction: doublePrecision("from_total_production").notNull(),
    toTotalProduction: doublePrecision("to_total_production").notNull(),
    productionDelta: doublePrecision("production_delta").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.fromSnapshotId, table.toSnapshotId, table.itemCode] }),
    index("item_deltas_pair_item_code_idx").on(
      table.fromSnapshotId,
      table.toSnapshotId,
      table.itemCode,
    ),
  ],
);

export const snapshotArchives = pgTable(
  "snapshot_archives",
  {
    snapshotId: uuid("snapshot_id")
      .references(() => snapshots.id, { onDelete: "cascade" })
      .primaryKey(),
    archiveStatus: snapshotArchiveStatusEnum("archive_status")
      .default("pending")
      .notNull(),
    bucketName: text("bucket_name"),
    objectPrefix: text("object_prefix"),
    manifestKey: text("manifest_key"),
    manifestEtag: text("manifest_etag"),
    totalBytes: integer("total_bytes"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    dbPrunedAt: timestamp("db_pruned_at", { withTimezone: true }),
    lastError: text("last_error"),
  },
  (table) => [index("snapshot_archives_status_idx").on(table.archiveStatus)],
);

export const appState = pgTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type CountryAggregateRow = typeof countryAggregates.$inferSelect;
export type RegionAggregateRow = typeof regionAggregates.$inferSelect;
export type ItemAggregateRow = typeof itemAggregates.$inferSelect;
export type ItemDeltaRow = typeof itemDeltas.$inferSelect;
