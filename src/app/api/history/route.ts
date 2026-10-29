import { and, desc, eq, count } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { analyses } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { paginated, route } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES = [
  "content_analysis",
  "keyword_clustering",
  "content_brief",
  "article_draft",
  "meta_generation",
  "geo_analysis",
  "internal_link_analysis",
  "technical_audit",
  "gsc_analysis",
] as const;
type AnalysisType = (typeof VALID_TYPES)[number];
const VALID_STATUS = ["queued", "running", "completed", "failed", "cancelled"] as const;
type AnalysisStatus = (typeof VALID_STATUS)[number];

export const GET = route(async (req) => {
  const user = await requireSessionUser();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const type = url.searchParams.get("type");
  const status = url.searchParams.get("status");
  const page = Math.max(Number(url.searchParams.get("page") ?? "1"), 1);
  const perPage = Math.min(Math.max(Number(url.searchParams.get("perPage") ?? "25"), 1), 100);

  const db = getDb();
  const conditions = [eq(analyses.userId, user.id)];
  if (projectId) conditions.push(eq(analyses.projectId, projectId));
  if (type && (VALID_TYPES as readonly string[]).includes(type)) {
    conditions.push(eq(analyses.type, type as AnalysisType));
  }
  if (status && (VALID_STATUS as readonly string[]).includes(status)) {
    conditions.push(eq(analyses.status, status as AnalysisStatus));
  }
  const where = and(...conditions);

  const rows = await db
    .select({
      id: analyses.id,
      type: analyses.type,
      status: analyses.status,
      summary: analyses.summary,
      model: analyses.model,
      createdAt: analyses.createdAt,
      completedAt: analyses.completedAt,
      projectId: analyses.projectId,
      errorCode: analyses.errorCode,
    })
    .from(analyses)
    .where(where)
    .orderBy(desc(analyses.createdAt))
    .limit(perPage)
    .offset((page - 1) * perPage);
  const [{ n }] = await db.select({ n: count() }).from(analyses).where(where);

  return paginated(rows, { page, perPage, total: Number(n) });
});
