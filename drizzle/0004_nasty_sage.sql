CREATE TABLE "country_tax_hourly" (
	"bucket_started_at" timestamp with time zone NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"country_id" text NOT NULL,
	"country_code" text NOT NULL,
	"country_name" text NOT NULL,
	"region_id" text NOT NULL,
	"region_code" text NOT NULL,
	"region_name" text NOT NULL,
	"owner_country_group_key" text NOT NULL,
	"owner_country_id" text,
	"owner_country_code" text,
	"owner_country_name" text,
	"item_code" text NOT NULL,
	"core" boolean NOT NULL,
	"wages_paid" double precision NOT NULL,
	"tax_income" double precision NOT NULL,
	"tax_rate" double precision NOT NULL,
	"company_observations" integer NOT NULL,
	CONSTRAINT "country_tax_hourly_bucket_started_at_country_id_region_id_owner_country_group_key_item_code_core_pk" PRIMARY KEY("bucket_started_at","country_id","region_id","owner_country_group_key","item_code","core")
);
--> statement-breakpoint
ALTER TABLE "company_snapshot_rows" ADD COLUMN "hourly_wages" double precision;--> statement-breakpoint
ALTER TABLE "region_reference" ADD COLUMN "initial_country_id" text;--> statement-breakpoint
ALTER TABLE "region_reference" ADD COLUMN "initial_country_code" text;--> statement-breakpoint
ALTER TABLE "region_reference" ADD COLUMN "initial_country_name" text;--> statement-breakpoint
UPDATE "region_reference"
SET
	"initial_country_id" = "country_id",
	"initial_country_code" = "country_code",
	"initial_country_name" = "country_name"
WHERE "initial_country_id" IS NULL;--> statement-breakpoint
ALTER TABLE "region_reference" ALTER COLUMN "initial_country_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "region_reference" ALTER COLUMN "initial_country_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "region_reference" ALTER COLUMN "initial_country_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "country_tax_hourly" ADD CONSTRAINT "country_tax_hourly_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "country_tax_hourly_country_bucket_idx" ON "country_tax_hourly" USING btree ("country_code","bucket_started_at");--> statement-breakpoint
CREATE INDEX "country_tax_hourly_snapshot_idx" ON "country_tax_hourly" USING btree ("snapshot_id");
