CREATE TYPE "public"."snapshot_archive_status" AS ENUM('pending', 'uploaded', 'pruned', 'failed');--> statement-breakpoint
ALTER TYPE "public"."sync_phase" ADD VALUE 'build_deltas' BEFORE 'promote_snapshot';--> statement-breakpoint
CREATE TABLE "company_deltas" (
	"from_snapshot_id" uuid NOT NULL,
	"to_snapshot_id" uuid NOT NULL,
	"company_id" text NOT NULL,
	"exists_in_from" boolean NOT NULL,
	"exists_in_to" boolean NOT NULL,
	"from_region_id" text,
	"to_region_id" text,
	"from_country_id" text,
	"to_country_id" text,
	"from_owner_country_id" text,
	"to_owner_country_id" text,
	"region_changed" boolean NOT NULL,
	"country_changed" boolean NOT NULL,
	"owner_country_changed" boolean NOT NULL,
	"worker_count_delta" integer,
	"estimated_value_delta" double precision,
	"production_delta" double precision,
	CONSTRAINT "company_deltas_from_snapshot_id_to_snapshot_id_company_id_pk" PRIMARY KEY("from_snapshot_id","to_snapshot_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "country_deltas" (
	"from_snapshot_id" uuid NOT NULL,
	"to_snapshot_id" uuid NOT NULL,
	"country_id" text NOT NULL,
	"country_code" text NOT NULL,
	"country_name" text NOT NULL,
	"from_company_count" integer NOT NULL,
	"to_company_count" integer NOT NULL,
	"company_count_delta" integer NOT NULL,
	"regions_with_companies_delta" integer NOT NULL,
	"domestic_owned_delta" integer NOT NULL,
	"foreign_owned_delta" integer NOT NULL,
	"unique_owner_countries_delta" integer NOT NULL,
	"gained_companies_count" integer NOT NULL,
	"lost_companies_count" integer NOT NULL,
	"from_income_tax" double precision,
	"to_income_tax" double precision,
	"income_tax_delta" double precision,
	"from_market_tax" double precision,
	"to_market_tax" double precision,
	"market_tax_delta" double precision,
	"from_self_work_tax" double precision,
	"to_self_work_tax" double precision,
	"self_work_tax_delta" double precision,
	CONSTRAINT "country_deltas_from_snapshot_id_to_snapshot_id_country_id_pk" PRIMARY KEY("from_snapshot_id","to_snapshot_id","country_id")
);
--> statement-breakpoint
CREATE TABLE "region_deltas" (
	"from_snapshot_id" uuid NOT NULL,
	"to_snapshot_id" uuid NOT NULL,
	"region_id" text NOT NULL,
	"region_code" text NOT NULL,
	"region_name" text NOT NULL,
	"country_id" text NOT NULL,
	"country_code" text NOT NULL,
	"country_name" text NOT NULL,
	"from_company_count" integer NOT NULL,
	"to_company_count" integer NOT NULL,
	"company_count_delta" integer NOT NULL,
	"domestic_owned_delta" integer NOT NULL,
	"foreign_owned_delta" integer NOT NULL,
	"unique_owner_countries_delta" integer NOT NULL,
	"gained_companies_count" integer NOT NULL,
	"lost_companies_count" integer NOT NULL,
	"net_flow" integer NOT NULL,
	CONSTRAINT "region_deltas_from_snapshot_id_to_snapshot_id_region_id_pk" PRIMARY KEY("from_snapshot_id","to_snapshot_id","region_id")
);
--> statement-breakpoint
CREATE TABLE "snapshot_archives" (
	"snapshot_id" uuid PRIMARY KEY NOT NULL,
	"archive_status" "snapshot_archive_status" DEFAULT 'pending' NOT NULL,
	"bucket_name" text,
	"object_prefix" text,
	"manifest_key" text,
	"manifest_etag" text,
	"total_bytes" integer,
	"uploaded_at" timestamp with time zone,
	"db_pruned_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "snapshot_comparisons" (
	"from_snapshot_id" uuid NOT NULL,
	"to_snapshot_id" uuid NOT NULL,
	"from_snapshot_completed_at" timestamp with time zone NOT NULL,
	"to_snapshot_completed_at" timestamp with time zone NOT NULL,
	"new_companies_count" integer NOT NULL,
	"deleted_companies_count" integer NOT NULL,
	"region_moved_count" integer NOT NULL,
	"country_moved_count" integer NOT NULL,
	"owner_country_changed_count" integer NOT NULL,
	"delta_build_completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "snapshot_comparisons_from_snapshot_id_to_snapshot_id_pk" PRIMARY KEY("from_snapshot_id","to_snapshot_id")
);
--> statement-breakpoint
ALTER TABLE "company_deltas" ADD CONSTRAINT "company_deltas_from_snapshot_id_snapshots_id_fk" FOREIGN KEY ("from_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_deltas" ADD CONSTRAINT "company_deltas_to_snapshot_id_snapshots_id_fk" FOREIGN KEY ("to_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_deltas" ADD CONSTRAINT "country_deltas_from_snapshot_id_snapshots_id_fk" FOREIGN KEY ("from_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_deltas" ADD CONSTRAINT "country_deltas_to_snapshot_id_snapshots_id_fk" FOREIGN KEY ("to_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_deltas" ADD CONSTRAINT "region_deltas_from_snapshot_id_snapshots_id_fk" FOREIGN KEY ("from_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_deltas" ADD CONSTRAINT "region_deltas_to_snapshot_id_snapshots_id_fk" FOREIGN KEY ("to_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_archives" ADD CONSTRAINT "snapshot_archives_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_comparisons" ADD CONSTRAINT "snapshot_comparisons_from_snapshot_id_snapshots_id_fk" FOREIGN KEY ("from_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_comparisons" ADD CONSTRAINT "snapshot_comparisons_to_snapshot_id_snapshots_id_fk" FOREIGN KEY ("to_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_deltas_company_to_snapshot_idx" ON "company_deltas" USING btree ("company_id","to_snapshot_id");--> statement-breakpoint
CREATE INDEX "country_deltas_pair_country_code_idx" ON "country_deltas" USING btree ("from_snapshot_id","to_snapshot_id","country_code");--> statement-breakpoint
CREATE INDEX "region_deltas_pair_region_code_idx" ON "region_deltas" USING btree ("from_snapshot_id","to_snapshot_id","region_code");--> statement-breakpoint
CREATE INDEX "snapshot_archives_status_idx" ON "snapshot_archives" USING btree ("archive_status");--> statement-breakpoint
CREATE INDEX "snapshot_comparisons_to_snapshot_idx" ON "snapshot_comparisons" USING btree ("to_snapshot_id");