import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { crawlJobs, crawlPages } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { fail, route } from "@/lib/api/response";
import { buildCsv } from "@/lib/seo/csv";

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
  const pages = await db.select().from(crawlPages).where(eq(crawlPages.jobId, id)).limit(1000);
  const csv = buildCsv(
    [
      { key: "url", header: "url" },
      { key: "statusCode", header: "status_code" },
      { key: "title", header: "title" },
      { key: "metaDescription", header: "meta_description" },
      { key: "canonical", header: "canonical" },
      { key: "metaRobots", header: "meta_robots" },
      { key: "h1", header: "h1" },
      { key: "h2Count", header: "h2_count" },
      { key: "h3Count", header: "h3_count" },
      { key: "internalCount", header: "internal_links" },
      { key: "externalCount", header: "external_links" },
      { key: "imagesWithoutAlt", header: "images_without_alt" },
      { key: "isDuplicate", header: "is_duplicate" },
    ],
    pages.map((p) => ({
      url: p.url,
      statusCode: p.statusCode,
      title: p.title,
      metaDescription: p.metaDescription,
      canonical: p.canonical,
      metaRobots: p.metaRobots,
      h1: (p.h1s ?? []).join(" | "),
      h2Count: p.h2Count,
      h3Count: p.h3Count,
      internalCount: (p.internalLinks ?? []).length,
      externalCount: (p.externalLinks ?? []).length,
      imagesWithoutAlt: p.imagesWithoutAlt,
      isDuplicate: p.isDuplicate,
    })),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="crawl-${id.slice(0, 8)}.csv"`,
    },
  });
});
