import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { crawlJobs } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { assertProjectOwnership } from "@/lib/auth/ownership";
import { ok, fail, route, readJson } from "@/lib/api/response";
import { createCrawlJob, CrawlError } from "@/lib/crawl/crawler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  projectId: z.string().uuid(),
  startUrl: z.string().url().max(600),
  maxUrls: z.number().int().min(1).max(50).default(30),
});

export const GET = route(async (req) => {
  const user = await requireSessionUser();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const db = getDb();
  const rows = projectId
    ? await db
        .select()
        .from(crawlJobs)
        .where(eq(crawlJobs.projectId, projectId))
        .orderBy(desc(crawlJobs.createdAt))
        .limit(30)
    : await db
        .select()
        .from(crawlJobs)
        .where(eq(crawlJobs.userId, user.id))
        .orderBy(desc(crawlJobs.createdAt))
        .limit(30);
  if (projectId) await assertProjectOwnership(projectId, user.id);
  return ok(rows);
});

export const POST = route(async (req) => {
  const user = await requireSessionUser();
  const parsed = createSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return fail("INVALID_INPUT", "URL tidak valid. Maksimal 50 URL per crawl (versi pertama).");
  }
  const { projectId, startUrl, maxUrls } = parsed.data;
  await assertProjectOwnership(projectId, user.id);
  try {
    const result = await createCrawlJob({ projectId, userId: user.id, startUrl, maxUrls });
    return ok(result, { status: 201 });
  } catch (e) {
    if (e instanceof CrawlError) {
      return fail(e.code, "URL ditolak: hanya situs publik yang diizinkan (bukan localhost/IP internal/metadata cloud).", 400);
    }
    throw e;
  }
});
