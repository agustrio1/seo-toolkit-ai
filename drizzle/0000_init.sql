CREATE TYPE "public"."analysis_type" AS ENUM('content_analysis', 'keyword_clustering', 'content_brief', 'article_draft', 'meta_generation', 'geo_analysis', 'internal_link_analysis', 'technical_audit', 'gsc_analysis');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('connected', 'disconnected', 'expired', 'error');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."search_intent" AS ENUM('informational', 'commercial', 'transactional', 'navigational');--> statement-breakpoint
CREATE TYPE "public"."usage_status" AS ENUM('ok', 'error', 'rate_limited', 'blocked_budget');--> statement-breakpoint
CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"type" "analysis_type" NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"input_ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text,
	"result" jsonb,
	"prompt_version" varchar(40) DEFAULT 'v1' NOT NULL,
	"model" varchar(100),
	"tokens_in" integer,
	"tokens_out" integer,
	"error_code" varchar(60),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bulk_job_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "item_status" DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"error" varchar(200),
	"claimed_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bulk_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"type" varchar(60) NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"total_items" integer DEFAULT 0 NOT NULL,
	"processed_items" integer DEFAULT 0 NOT NULL,
	"failed_items" integer DEFAULT 0 NOT NULL,
	"error_summary" text,
	"idempotency_key" varchar(100),
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bulk_jobs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "cluster_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cluster_id" uuid NOT NULL,
	"keyword_item_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(300) NOT NULL,
	"primary_keyword" varchar(300),
	"payload" jsonb NOT NULL,
	"analysis_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crawl_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"start_url" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"max_urls" integer DEFAULT 50 NOT NULL,
	"urls_done" integer DEFAULT 0 NOT NULL,
	"urls_found" integer DEFAULT 0 NOT NULL,
	"error_summary" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crawl_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"url_hash" varchar(64) NOT NULL,
	"url" text NOT NULL,
	"status_code" integer,
	"title" text,
	"meta_description" text,
	"canonical" text,
	"meta_robots" varchar(200),
	"h1s" text[],
	"h2_count" integer,
	"h3_count" integer,
	"internal_links" text[],
	"external_links" text[],
	"images_without_alt" integer,
	"is_duplicate" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crawl_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"url" text NOT NULL,
	"url_hash" varchar(64) NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"status" "item_status" DEFAULT 'pending' NOT NULL,
	"error" varchar(200)
);
--> statement-breakpoint
CREATE TABLE "gsc_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"row_type" varchar(10) NOT NULL,
	"dimension" varchar(400) NOT NULL,
	"date_start" varchar(10) NOT NULL,
	"date_end" varchar(10) NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"position" numeric(8, 2),
	"device" varchar(20),
	"country" varchar(10),
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"type" varchar(40) DEFAULT 'gsc' NOT NULL,
	"property" varchar(400),
	"status" "integration_status" DEFAULT 'disconnected' NOT NULL,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"token_expires_at" timestamp with time zone,
	"authorized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"analysis_id" uuid,
	"cluster_name" varchar(200) NOT NULL,
	"intent" "search_intent",
	"primary_keyword" varchar(300),
	"suggested_page_type" varchar(100),
	"target_page" varchar(500),
	"reasoning" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"list_id" uuid,
	"keyword" varchar(300) NOT NULL,
	"normalized" varchar(300) NOT NULL,
	"volume" integer,
	"difficulty" integer,
	"cpc" numeric(10, 4),
	"data_source" varchar(100),
	"data_date" varchar(30),
	"intent" "search_intent",
	"target_page" varchar(500),
	"notes" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"source" varchar(60) DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"domain" varchar(300) NOT NULL,
	"description" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"type" "analysis_type" NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"tool" varchar(60) NOT NULL,
	"model" varchar(100),
	"status" "usage_status" NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"estimated_cost" numeric(10, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"default_project_id" uuid,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(200) NOT NULL,
	"password_hash" varchar(200) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_job_items" ADD CONSTRAINT "bulk_job_items_job_id_bulk_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."bulk_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_jobs" ADD CONSTRAINT "bulk_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_jobs" ADD CONSTRAINT "bulk_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_members" ADD CONSTRAINT "cluster_members_cluster_id_keyword_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."keyword_clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster_members" ADD CONSTRAINT "cluster_members_keyword_item_id_keyword_items_id_fk" FOREIGN KEY ("keyword_item_id") REFERENCES "public"."keyword_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_briefs" ADD CONSTRAINT "content_briefs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_jobs" ADD CONSTRAINT "crawl_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_jobs" ADD CONSTRAINT "crawl_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_pages" ADD CONSTRAINT "crawl_pages_job_id_crawl_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."crawl_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_queue" ADD CONSTRAINT "crawl_queue_job_id_crawl_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."crawl_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_rows" ADD CONSTRAINT "gsc_rows_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_clusters" ADD CONSTRAINT "keyword_clusters_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_items" ADD CONSTRAINT "keyword_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_items" ADD CONSTRAINT "keyword_items_list_id_keyword_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."keyword_lists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_lists" ADD CONSTRAINT "keyword_lists_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_default_project_id_projects_id_fk" FOREIGN KEY ("default_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analyses_project_idx" ON "analyses" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "analyses_user_type_idx" ON "analyses" USING btree ("user_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "bulk_job_items_unique" ON "bulk_job_items" USING btree ("job_id","ordinal");--> statement-breakpoint
CREATE INDEX "bulk_jobs_user_status_idx" ON "bulk_jobs" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "cluster_members_unique" ON "cluster_members" USING btree ("cluster_id","keyword_item_id");--> statement-breakpoint
CREATE INDEX "content_briefs_project_idx" ON "content_briefs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "crawl_jobs_project_idx" ON "crawl_jobs" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crawl_pages_job_url_idx" ON "crawl_pages" USING btree ("job_id","url_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "crawl_queue_job_url_idx" ON "crawl_queue" USING btree ("job_id","url_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "gsc_rows_unique" ON "gsc_rows" USING btree ("project_id","row_type","dimension","date_start","date_end","device","country");--> statement-breakpoint
CREATE INDEX "integrations_user_idx" ON "integrations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "keyword_clusters_project_idx" ON "keyword_clusters" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "keyword_items_project_normalized_idx" ON "keyword_items" USING btree ("project_id","normalized");--> statement-breakpoint
CREATE INDEX "keyword_items_project_idx" ON "keyword_items" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "keyword_lists_project_idx" ON "keyword_lists" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "projects_user_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reports_user_idx" ON "reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_user_created_idx" ON "usage_records" USING btree ("user_id","created_at");