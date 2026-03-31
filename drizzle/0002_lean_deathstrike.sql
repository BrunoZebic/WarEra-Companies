CREATE TABLE "item_aggregates" (
	"snapshot_id" uuid NOT NULL,
	"item_code" text NOT NULL,
	"company_count" integer NOT NULL,
	"total_workers" integer NOT NULL,
	"total_production" double precision NOT NULL,
	CONSTRAINT "item_aggregates_snapshot_id_item_code_pk" PRIMARY KEY("snapshot_id","item_code")
);
--> statement-breakpoint
CREATE TABLE "item_deltas" (
	"from_snapshot_id" uuid NOT NULL,
	"to_snapshot_id" uuid NOT NULL,
	"item_code" text NOT NULL,
	"from_company_count" integer NOT NULL,
	"to_company_count" integer NOT NULL,
	"company_count_delta" integer NOT NULL,
	"from_total_workers" integer NOT NULL,
	"to_total_workers" integer NOT NULL,
	"workers_delta" integer NOT NULL,
	"from_total_production" double precision NOT NULL,
	"to_total_production" double precision NOT NULL,
	"production_delta" double precision NOT NULL,
	CONSTRAINT "item_deltas_from_snapshot_id_to_snapshot_id_item_code_pk" PRIMARY KEY("from_snapshot_id","to_snapshot_id","item_code")
);
--> statement-breakpoint
ALTER TABLE "item_aggregates" ADD CONSTRAINT "item_aggregates_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_deltas" ADD CONSTRAINT "item_deltas_from_snapshot_id_snapshots_id_fk" FOREIGN KEY ("from_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_deltas" ADD CONSTRAINT "item_deltas_to_snapshot_id_snapshots_id_fk" FOREIGN KEY ("to_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_aggregates_snapshot_company_count_idx" ON "item_aggregates" USING btree ("snapshot_id","company_count");--> statement-breakpoint
CREATE INDEX "item_deltas_pair_item_code_idx" ON "item_deltas" USING btree ("from_snapshot_id","to_snapshot_id","item_code");--> statement-breakpoint
CREATE INDEX "company_snapshot_rows_snapshot_item_code_idx" ON "company_snapshot_rows" USING btree ("snapshot_id","item_code");