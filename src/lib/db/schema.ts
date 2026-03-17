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
  "promote_snapshot",
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

export const appState = pgTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type CountryAggregateRow = typeof countryAggregates.$inferSelect;
export type RegionAggregateRow = typeof regionAggregates.$inferSelect;
