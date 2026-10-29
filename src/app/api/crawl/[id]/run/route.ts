import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { crawlJobs } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { assertProjectOwnership } from "@/lib/auth/ownership";
import { ok, fail, route } from "@/lib/api/response";
import { runCrawlBatch, CrawlError } from "@/lib/crawl/crawler";

export const runtime = "nodejs";

export const POST = route(async (_req, ctx) => {
  const user = await requireSessionUser();
  const { id } = await ctx.params;
  const db = getDb();
  const jobs = await db.select().from(crawlJobs).where(eq(crawlJobs.id, id)).limit(1);
  if (jobs.length === 0 || jobs[0].userId !== user.id) {
    return fail("NOT_FOUND", "Crawl job tidak ditemukan.", 404);
  }
  await assertProjectOwnership(jobs[0].projectId, user.id);
  try {
    const result = await runCrawlBatch(id);
    return ok(result);
  } catch (e) {
    if (e instanceof CrawlError) return fail(e.code, "Batch crawl gagal diproses.", 400);
    throw e;
  }
});
