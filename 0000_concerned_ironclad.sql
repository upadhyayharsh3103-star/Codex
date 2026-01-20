CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"size_bytes" integer DEFAULT 0,
	"is_active" boolean DEFAULT false,
	"metadata" jsonb,
	"storage_tier" text DEFAULT 'hot',
	"last_accessed_at" timestamp DEFAULT now(),
	"access_count" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"file_path" text NOT NULL,
	"object_storage_key" text,
	"size_bytes" integer DEFAULT 0,
	"compressed_size" integer,
	"encrypted" boolean DEFAULT true,
	"compression_algorithm" text DEFAULT 'gzip',
	"deduplication_hash" text,
	"storage_tier" text DEFAULT 'warm',
	"metadata" jsonb,
	"last_accessed_at" timestamp DEFAULT now(),
	"access_count" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "oauth_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"provider" text NOT NULL,
	"email" text,
	"access_token" text,
	"refresh_token" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"total_profiles" integer DEFAULT 0,
	"total_snapshots" integer DEFAULT 0,
	"total_size_bytes" integer DEFAULT 0,
	"compressed_size_bytes" integer DEFAULT 0,
	"hot_storage_bytes" integer DEFAULT 0,
	"warm_storage_bytes" integer DEFAULT 0,
	"cold_storage_bytes" integer DEFAULT 0,
	"cache_hit_rate" real DEFAULT 0,
	"avg_access_time" real DEFAULT 0,
	"deduplication_savings" integer DEFAULT 0,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "storage_backups" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"status" text DEFAULT 'pending',
	"size_bytes" integer DEFAULT 0,
	"items_backed_up" integer DEFAULT 0,
	"file_path" text,
	"error_message" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "storage_quotas" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" text,
	"quota_type" text NOT NULL,
	"limit_value" integer NOT NULL,
	"current_value" integer DEFAULT 0,
	"warning_threshold" real DEFAULT 0.8,
	"is_exceeded" boolean DEFAULT false,
	"last_checked_at" timestamp DEFAULT now(),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "cache_entries" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" timestamp,
	"hit_count" integer DEFAULT 0,
	"last_accessed_at" timestamp DEFAULT now(),
	"size_bytes" integer DEFAULT 0,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_credentials" ADD CONSTRAINT "oauth_credentials_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_quotas" ADD CONSTRAINT "storage_quotas_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profiles_name_idx" ON "profiles" USING btree ("name");--> statement-breakpoint
CREATE INDEX "profiles_storage_tier_idx" ON "profiles" USING btree ("storage_tier");--> statement-breakpoint
CREATE INDEX "profiles_last_access_idx" ON "profiles" USING btree ("last_accessed_at");--> statement-breakpoint
CREATE INDEX "snapshots_profile_idx" ON "snapshots" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "snapshots_dedup_idx" ON "snapshots" USING btree ("deduplication_hash");--> statement-breakpoint
CREATE INDEX "snapshots_storage_tier_idx" ON "snapshots" USING btree ("storage_tier");--> statement-breakpoint
CREATE INDEX "oauth_profile_provider_idx" ON "oauth_credentials" USING btree ("profile_id","provider");--> statement-breakpoint
CREATE INDEX "backups_status_idx" ON "storage_backups" USING btree ("status");--> statement-breakpoint
CREATE INDEX "backups_type_idx" ON "storage_backups" USING btree ("type");--> statement-breakpoint
CREATE INDEX "cache_expires_idx" ON "cache_entries" USING btree ("expires_at");