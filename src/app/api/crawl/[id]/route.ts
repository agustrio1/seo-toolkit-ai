import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { crawlJobs, crawlPages } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { assertProjectOwnership } from "@/lib/auth/ownership";
import { ok, fail, route } from "@/lib/api/response";
import { computeCrawlFindings } from "@/lib/crawl/crawler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (_req, ctx) => {
  const user = await requireSessionUser();
  const { id } = await ctx.params;
  const db = getDb();
  const jobs = await db.select().from(crawlJobs).where(eq(crawlJobs.id, id)).limit(1);
  if (jobs.length === 0 || jobs[0].userId !== user.id) {
    return fail("NOT_FOUND", "Crawl job tidak ditemukan.", 404);
  }
  await assertProjectOwnership(jobs[0].projectId, user.id);
  const pages = await db
    .select()
    .from(crawlPages)
    .where(eq(crawlPages.jobId, id))
    .orderBy(desc(crawlPages.fetchedAt))
    .limit(200);
  const findings = await computeCrawlFindings(id);
  return ok({ job: jobs[0], pages, findings });
});
