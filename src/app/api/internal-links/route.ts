import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { analyses, crawlJobs, crawlPages, keywordClusters } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { assertProjectOwnership } from "@/lib/auth/ownership";
import { ok, fail, route, readJson } from "@/lib/api/response";
import { generateJson } from "@/lib/gemini/client";
import { buildInternalLinksPrompt } from "@/lib/gemini/prompts";

export const runtime = "nodejs";

const schema = z.object({
  projectId: z.string().uuid(),
  crawlJobId: z.string().uuid(),
  useAi: z.boolean().default(true),
});

/**
 * Bagian deterministik: halaman yatim (tanpa link masuk), link keluar sedikit,
 * dihitung dari hasil crawl nyata. AI hanya menambah rekomendasi yang dapat
 * ditinjau — bukan perubahan otomatis.
 */
export const POST = route(async (req) => {
  const user = await requireSessionUser();
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return fail("INVALID_INPUT", "Pemilihan project/crawl tidak valid.");
  const { projectId, crawlJobId, useAi } = parsed.data;
  await assertProjectOwnership(projectId, user.id);

  const db = getDb();
  const jobs = await db
    .select()
    .from(crawlJobs)
    .where(eq(crawlJobs.id, crawlJobId))
    .limit(1);
  if (jobs.length === 0 || jobs[0].projectId !== projectId) {
    return fail("NOT_FOUND", "Hasil crawl tidak ditemukan untuk project ini.", 404);
  }
  const pages = await db.select().from(crawlPages).where(eq(crawlPages.jobId, crawlJobId)).limit(200);
  if (pages.length === 0) return fail("NO_DATA", "Crawl belum menghasilkan halaman.", 400);

  // Hitung link masuk antar halaman yang di-crawl.
  const inbound = new Map<string, number>();
  const urlByNorm = new Map(pages.map((p) => [p.url, p]));
  for (const p of pages) {
    for (const link of p.internalLinks ?? []) {
      inbound.set(link, (inbound.get(link) ?? 0) + 1);
    }
  }
  const orphanPages = pages
    .filter((p) => p.statusCode === 200 && (inbound.get(p.url) ?? 0) === 0 && p.url !== jobs[0].startUrl)
    .map((p) => p.url);
  const thinLinkedPages = pages
    .filter((p) => (inbound.get(p.url) ?? 0) > 0 && (inbound.get(p.url) ?? 0) <= 1 && (p.internalLinks?.length ?? 0) <= 2)
    .map((p) => p.url);

  const pageStats = pages
    .map((p) => {
      const title = (p.title ?? "-").slice(0, 80);
      const h1 = (p.h1s ?? [])[0]?.slice(0, 60) ?? "-";
      return `${p.url} | ${title} | H1: ${h1} | masuk=${inbound.get(p.url) ?? 0} keluar=${p.internalLinks?.length ?? 0}`;
    })
    .join("\n");

  const clusters = await db
    .select()
    .from(keywordClusters)
    .where(eq(keywordClusters.projectId, projectId))
    .orderBy(desc(keywordClusters.createdAt))
    .limit(30);
  const clustersSummary = clusters
    .map((c) => `${c.clusterName} (${c.intent ?? "-"}): ${c.primaryKeyword ?? ""}`)
    .join("\n");

  let aiResult = null;
  if (useAi) {
    const ai = await generateJson({
      tool: "internal_links",
      ...buildInternalLinksPrompt({
        userId: user.id,
        projectId,
        pagesSummary: pageStats,
        clustersSummary,
      }),
    });
    // Verifikasi: URL rekomendasi harus ada dalam data crawl.
    const knownUrls = new Set([...pages.map((p) => p.url), ...urlByNorm.keys()]);
    const validRecs = ai.data.recommendations.filter(
      (r) => knownUrls.has(r.fromUrl) && knownUrls.has(r.toUrl),
    );
    aiResult = { ...ai.data, recommendations: validRecs, droppedHallucinated: ai.data.recommendations.length - validRecs.length };

    await db.insert(analyses).values({
      userId: user.id,
      projectId,
      type: "internal_link_analysis",
      status: "completed",
      inputRef: { crawlJobId, pageCount: pages.length },
      result: { deterministic: { orphanPages, thinLinkedPages }, ai: aiResult } as unknown as Record<string, unknown>,
      summary: `${validRecs.length} rekomendasi link, ${orphanPages.length} halaman yatim`,
      model: ai.model,
      tokensIn: ai.tokensIn,
      tokensOut: ai.tokensOut,
      completedAt: new Date(),
    });
  }

  return ok({
    deterministic: { orphanPages, thinLinkedPages, totalPages: pages.length },
    ai: aiResult,
    note: "Rekomendasi berdasarkan hasil crawl dan perlu ditinjau manual; skor topical authority bukan skor resmi Google.",
  });
});
