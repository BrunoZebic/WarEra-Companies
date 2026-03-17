CREATE TYPE "public"."snapshot_source" AS ENUM('scheduled', 'manual');--> statement-breakpoint
CREATE TYPE "public"."snapshot_status" AS ENUM('staging', 'promoted', 'failed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."sync_phase" AS ENUM('load_reference_data', 'sync_company_pages', 'build_aggregates', 'promote_snapshot');--> statement-breakpoint
CREATE TYPE "public"."sync_run_status" AS ENUM('running', 'completed', 'failed', 'stale');--> statement-breakpoint
CREATE TABLE "app_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_snapshot_rows" (
	"snapshot_id" uuid NOT NULL,
	"company_id" text NOT NULL,
	"company_name" text NOT NULL,
	"item_code" text,
	"region_id" text NOT NULL,
	"region_code" text NOT NULL,
	"region_name" text NOT NULL,
	"country_id" text NOT NULL,
	"country_code" text NOT NULL,
	"country_name" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"owner_username" text,
	"owner_country_id" text,
	"owner_country_code" text,
	"owner_country_name" text,
	"worker_count" integer,
	"estimated_value" double precision,
	"production" double precision,
	"is_full" boolean,
	"warera_updated_at" timestamp with time zone,
	CONSTRAINT "company_snapshot_rows_snapshot_id_company_id_pk" PRIMARY KEY("snapshot_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "country_aggregates" (
	"snapshot_id" uuid NOT NULL,
	"country_id" text NOT NULL,
	"country_code" text NOT NULL,
	"country_name" text NOT NULL,
	"income_tax" double precision NOT NULL,
	"market_tax" double precision NOT NULL,
	"self_work_tax" double precision NOT NULL,
	"company_count" integer NOT NULL,
	"regions_with_companies" integer NOT NULL,
	"domestic_owned_count" integer NOT NULL,
	"foreign_owned_count" integer NOT NULL,
	"unique_owner_countries" integer NOT NULL,
	"top_owner_country_code" text,
	"top_owner_country_name" text,
	"top_owner_country_company_count" integer NOT NULL,
	CONSTRAINT "country_aggregates_snapshot_id_country_id_pk" PRIMARY KEY("snapshot_id","country_id")
);
--> statement-breakpoint
CREATE TABLE "country_reference" (
	"snapshot_id" uuid NOT NULL,
	"country_id" text NOT NULL,
	"country_code" text NOT NULL,
	"country_name" text NOT NULL,
	"income_tax" double precision NOT NULL,
	"market_tax" double precision NOT NULL,
	"self_work_tax" double precision NOT NULL,
	CONSTRAINT "country_reference_snapshot_id_country_id_pk" PRIMARY KEY("snapshot_id","country_id")
);
--> statement-breakpoint
CREATE TABLE "region_aggregates" (
	"snapshot_id" uuid NOT NULL,
	"region_id" text NOT NULL,
	"region_code" text NOT NULL,
	"region_name" text NOT NULL,
	"country_id" text NOT NULL,
	"country_code" text NOT NULL,
	"country_name" text NOT NULL,
	"income_tax" double precision NOT NULL,
	"development" double precision,
	"company_count" integer NOT NULL,
	"domestic_owned_count" integer NOT NULL,
	"foreign_owned_count" integer NOT NULL,
	"unique_owner_countries" integer NOT NULL,
	"top_owner_country_code" text,
	"top_owner_country_name" text,
	"top_owner_country_company_count" integer NOT NULL,
	CONSTRAINT "region_aggregates_snapshot_id_region_id_pk" PRIMARY KEY("snapshot_id","region_id")
);
--> statement-breakpoint
CREATE TABLE "region_reference" (
	"snapshot_id" uuid NOT NULL,
	"region_id" text NOT NULL,
	"region_code" text NOT NULL,
	"region_name" text NOT NULL,
	"country_id" text NOT NULL,
	"country_code" text NOT NULL,
	"country_name" text NOT NULL,
	"development" double precision,
	"main_city" text,
	"latitude" double precision,
	"longitude" double precision,
	CONSTRAINT "region_reference_snapshot_id_region_id_pk" PRIMARY KEY("snapshot_id","region_id")
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "snapshot_status" DEFAULT 'staging' NOT NULL,
	"source" "snapshot_source" DEFAULT 'scheduled' NOT NULL,
	"completed_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"status" "sync_run_status" DEFAULT 'running' NOT NULL,
	"phase" "sync_phase" DEFAULT 'load_reference_data' NOT NULL,
	"phase_cursor" text,
	"company_pages_processed" integer DEFAULT 0 NOT NULL,
	"company_rows_written" integer DEFAULT 0 NOT NULL,
	"unique_users_fetched" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "company_snapshot_rows" ADD CONSTRAINT "company_snapshot_rows_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_aggregates" ADD CONSTRAINT "country_aggregates_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_reference" ADD CONSTRAINT "country_reference_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_aggregates" ADD CONSTRAINT "region_aggregates_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_reference" ADD CONSTRAINT "region_reference_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_snapshot_rows_snapshot_region_code_idx" ON "company_snapshot_rows" USING btree ("snapshot_id","region_code");--> statement-breakpoint
CREATE INDEX "company_snapshot_rows_snapshot_country_code_idx" ON "company_snapshot_rows" USING btree ("snapshot_id","country_code");--> statement-breakpoint
CREATE INDEX "company_snapshot_rows_snapshot_owner_country_code_idx" ON "company_snapshot_rows" USING btree ("snapshot_id","owner_country_code");--> statement-breakpoint
CREATE INDEX "company_snapshot_rows_snapshot_owner_user_idx" ON "company_snapshot_rows" USING btree ("snapshot_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "country_aggregates_snapshot_code_idx" ON "country_aggregates" USING btree ("snapshot_id","country_code");--> statement-breakpoint
CREATE INDEX "country_aggregates_snapshot_company_count_idx" ON "country_aggregates" USING btree ("snapshot_id","company_count");--> statement-breakpoint
CREATE INDEX "country_reference_snapshot_code_idx" ON "country_reference" USING btree ("snapshot_id","country_code");--> statement-breakpoint
CREATE INDEX "region_aggregates_snapshot_code_idx" ON "region_aggregates" USING btree ("snapshot_id","region_code");--> statement-breakpoint
CREATE INDEX "region_aggregates_snapshot_country_code_idx" ON "region_aggregates" USING btree ("snapshot_id","country_code");--> statement-breakpoint
CREATE INDEX "region_aggregates_snapshot_company_count_idx" ON "region_aggregates" USING btree ("snapshot_id","company_count");--> statement-breakpoint
CREATE INDEX "region_reference_snapshot_code_idx" ON "region_reference" USING btree ("snapshot_id","region_code");--> statement-breakpoint
CREATE INDEX "region_reference_snapshot_country_code_idx" ON "region_reference" USING btree ("snapshot_id","country_code");--> statement-breakpoint
CREATE INDEX "sync_runs_status_updated_idx" ON "sync_runs" USING btree ("status","updated_at");