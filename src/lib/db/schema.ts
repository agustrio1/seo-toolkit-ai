import {
  pgTable,
  pgEnum,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------
export const analysisTypeEnum = pgEnum("analysis_type", [
  "content_analysis",
  "keyword_clustering",
  "content_brief",
  "article_draft",
  "meta_generation",
  "geo_analysis",
  "internal_link_analysis",
  "technical_audit",
  "gsc_analysis",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const itemStatusEnum = pgEnum("item_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const integrationStatusEnum = pgEnum("integration_status", [
  "connected",
  "disconnected",
  "expired",
  "error",
]);

export const usageStatusEnum = pgEnum("usage_status", [
  "ok",
  "error",
  "rate_limited",
  "blocked_budget",
]);

export const searchIntentEnum = pgEnum("search_intent", [
  "informational",
  "commercial",
  "transactional",
  "navigational",
]);

// ---------- 8.1 Users & sessions ----------
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  passwordHash: varchar("password_hash", { length: 200 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ---------- 8.2 Projects ----------
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    domain: varchar("domain", { length: 300 }).notNull(),
    description: text("description"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("projects_user_idx").on(t.userId)],
);

// ---------- 8.3 Integrations (GSC) ----------
export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 40 }).notNull().default("gsc"),
    property: varchar("property", { length: 400 }),
    status: integrationStatusEnum("status").notNull().default("disconnected"),
    accessTokenEnc: text("access_token_enc"),
    refreshTokenEnc: text("refresh_token_enc"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    authorizedAt: timestamp("authorized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("integrations_user_idx").on(t.userId)],
);

// ---------- 8.4 Keyword workspace ----------
export const keywordLists = pgTable(
  "keyword_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    source: varchar("source", { length: 60 }).notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("keyword_lists_project_idx").on(t.projectId)],
);

export const keywordItems = pgTable(
  "keyword_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    listId: uuid("list_id").references(() => keywordLists.id, { onDelete: "set null" }),
    keyword: varchar("keyword", { length: 300 }).notNull(),
    normalized: varchar("normalized", { length: 300 }).notNull(),
    volume: integer("volume"),
    difficulty: integer("difficulty"),
    cpc: numeric("cpc", { precision: 10, scale: 4 }),
    dataSource: varchar("data_source", { length: 100 }),
    dataDate: varchar("data_date", { length: 30 }),
    intent: searchIntentEnum("intent"),
    targetPage: varchar("target_page", { length: 500 }),
    notes: text("notes"),
    tags: text("tags").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("keyword_items_project_normalized_idx").on(t.projectId, t.normalized),
    index("keyword_items_project_idx").on(t.projectId),
  ],
);

export const keywordClusters = pgTable(
  "keyword_clusters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    analysisId: uuid("analysis_id"),
    clusterName: varchar("cluster_name", { length: 200 }).notNull(),
    intent: searchIntentEnum("intent"),
    primaryKeyword: varchar("primary_keyword", { length: 300 }),
    suggestedPageType: varchar("suggested_page_type", { length: 100 }),
    targetPage: varchar("target_page", { length: 500 }),
    reasoning: text("reasoning"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("keyword_clusters_project_idx").on(t.projectId)],
);

export const clusterMembers = pgTable(
  "cluster_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clusterId: uuid("cluster_id")
      .notNull()
      .references(() => keywordClusters.id, { onDelete: "cascade" }),
    keywordItemId: uuid("keyword_item_id")
      .notNull()
      .references(() => keywordItems.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("cluster_members_unique").on(t.clusterId, t.keywordItemId)],
);

export const contentBriefs = pgTable(
  "content_briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 300 }).notNull(),
    primaryKeyword: varchar("primary_keyword", { length: 300 }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    analysisId: uuid("analysis_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("content_briefs_project_idx").on(t.projectId)],
);

// ---------- 8.5 Analyses & history ----------
export const analyses = pgTable(
  "analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    type: analysisTypeEnum("type").notNull(),
    status: jobStatusEnum("status").notNull().default("queued"),
    inputRef: jsonb("input_ref").$type<Record<string, unknown>>().notNull().default({}),
    summary: text("summary"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    promptVersion: varchar("prompt_version", { length: 40 }).notNull().default("v1"),
    model: varchar("model", { length: 100 }),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    errorCode: varchar("error_code", { length: 60 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("analyses_project_idx").on(t.projectId),
    index("analyses_user_type_idx").on(t.userId, t.type),
  ],
);

// ---------- 8.6 Crawl data ----------
export const crawlJobs = pgTable(
  "crawl_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startUrl: text("start_url").notNull(),
    settings: jsonb("settings").$type<{ disallow?: string[] }>().notNull().default({}),
    status: jobStatusEnum("status").notNull().default("queued"),
    maxUrls: integer("max_urls").notNull().default(50),
    urlsDone: integer("urls_done").notNull().default(0),
    urlsFound: integer("urls_found").notNull().default(0),
    errorSummary: text("error_summary"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crawl_jobs_project_idx").on(t.projectId)],
);

export const crawlPages = pgTable(
  "crawl_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => crawlJobs.id, { onDelete: "cascade" }),
    urlHash: varchar("url_hash", { length: 64 }).notNull(),
    url: text("url").notNull(),
    statusCode: integer("status_code"),
    title: text("title"),
    metaDescription: text("meta_description"),
    canonical: text("canonical"),
    metaRobots: varchar("meta_robots", { length: 200 }),
    h1s: text("h1s").array(),
    h2Count: integer("h2_count"),
    h3Count: integer("h3_count"),
    internalLinks: text("internal_links").array(),
    externalLinks: text("external_links").array(),
    imagesWithoutAlt: integer("images_without_alt"),
    isDuplicate: boolean("is_duplicate").notNull().default(false),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("crawl_pages_job_url_idx").on(t.jobId, t.urlHash)],
);

export const crawlQueue = pgTable(
  "crawl_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => crawlJobs.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    urlHash: varchar("url_hash", { length: 64 }).notNull(),
    depth: integer("depth").notNull().default(0),
    status: itemStatusEnum("status").notNull().default("pending"),
    error: varchar("error", { length: 200 }),
  },
  (t) => [uniqueIndex("crawl_queue_job_url_idx").on(t.jobId, t.urlHash)],
);

// ---------- GSC cached data ----------
export const gscRows = pgTable(
  "gsc_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    rowType: varchar("row_type", { length: 10 }).notNull(), // query | page
    dimension: varchar("dimension", { length: 400 }).notNull(),
    dateStart: varchar("date_start", { length: 10 }).notNull(),
    dateEnd: varchar("date_end", { length: 10 }).notNull(),
    clicks: integer("clicks").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    position: numeric("position", { precision: 8, scale: 2 }),
    device: varchar("device", { length: 20 }),
    country: varchar("country", { length: 10 }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("gsc_rows_unique").on(t.projectId, t.rowType, t.dimension, t.dateStart, t.dateEnd, t.device, t.country),
  ],
);

// ---------- 8.7 Reports ----------
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    type: analysisTypeEnum("type").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reports_user_idx").on(t.userId)],
);

// ---------- 8.8 Usage records ----------
export const usageRecords = pgTable(
  "usage_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    tool: varchar("tool", { length: 60 }).notNull(),
    model: varchar("model", { length: 100 }),
    status: usageStatusEnum("status").notNull(),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    estimatedCost: numeric("estimated_cost", { precision: 10, scale: 6 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("usage_user_created_idx").on(t.userId, t.createdAt)],
);

// ---------- 33 Bulk jobs ----------
export const bulkJobs = pgTable(
  "bulk_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 60 }).notNull(), // meta_generation | content_analysis | keyword_clustering | url_audit
    status: jobStatusEnum("status").notNull().default("queued"),
    totalItems: integer("total_items").notNull().default(0),
    processedItems: integer("processed_items").notNull().default(0),
    failedItems: integer("failed_items").notNull().default(0),
    errorSummary: text("error_summary"),
    idempotencyKey: varchar("idempotency_key", { length: 100 }).unique(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bulk_jobs_user_status_idx").on(t.userId, t.status)],
);

export const bulkJobItems = pgTable(
  "bulk_job_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => bulkJobs.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: itemStatusEnum("status").notNull().default("pending"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: varchar("error", { length: 200 }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("bulk_job_items_unique").on(t.jobId, t.ordinal)],
);

// ---------- 39 User preferences ----------
export const userPreferences = pgTable(
  "user_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
    defaultProjectId: uuid("default_project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    preferences: jsonb("preferences").$type<Record<string, unknown>>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export type UserId = typeof users.$inferSelect["id"];
export type ProjectRow = typeof projects.$inferSelect;
