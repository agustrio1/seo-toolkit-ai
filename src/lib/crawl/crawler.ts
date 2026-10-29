import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { crawlJobs, crawlPages, crawlQueue } from "@/lib/db/schema";
import { safeFetchHtml } from "./safe-fetch";
import { validateTargetUrl, SsrfError } from "./ssrf";
import { normalizeUrl, urlHash, parsePageHtml, parseRobotsDisallow } from "./parse-page";

// Konfigurasi konservatif sesuai batas serverless (BAGIAN I-22).
export const CRAWL_BATCH_SIZE = 5;
export const CRAWL_MAX_DEPTH = 3;
export const CRAWL_URL_TIMEOUT_MS = 8000;
export const CRAWL_MAX_RESPONSE_BYTES = 300_000;
export const CRAWL_MAX_SEED_FROM_SITEMAP = 100;

export class CrawlError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).hostname.replace(/^www\./, "").toLowerCase() ===
      new URL(b).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return false;
  }
}

export async function createCrawlJob(params: {
  projectId: string;
  userId: string;
  startUrl: string;
  maxUrls: number;
}) {
  // Validasi SSRF penuh sebelum job dibuat.
  let validated;
  try {
    validated = await validateTargetUrl(params.startUrl);
  } catch (e) {
    if (e instanceof SsrfError) throw new CrawlError(`SSRF_${e.code}`);
    throw new CrawlError("URL_INVALID");
  }
  const normalized = normalizeUrl(validated.url.toString());
  if (!normalized) throw new CrawlError("URL_INVALID");

  // Ambil robots.txt (best effort) untuk menghormati disallow.
  let disallow: string[] = [];
  try {
    const origin = new URL(normalized).origin;
    const robots = await safeFetchHtml(`${origin}/robots.txt`, {
      timeoutMs: CRAWL_URL_TIMEOUT_MS,
      maxBytes: 60_000,
    });
    if (robots.status === 200) disallow = parseRobotsDisallow(robots.body);
  } catch {
    disallow = [];
  }

  const db = getDb();
  const jobRows = await db
    .insert(crawlJobs)
    .values({
      projectId: params.projectId,
      userId: params.userId,
      startUrl: normalized,
      maxUrls: params.maxUrls,
      settings: { disallow },
      status: "queued",
    })
    .returning({ id: crawlJobs.id });
  const jobId = jobRows[0].id;
  await db.insert(crawlQueue).values({
    jobId,
    url: normalized,
    urlHash: urlHash(normalized),
    depth: 0,
  });
  await db
    .update(crawlJobs)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(crawlJobs.id, jobId));
  return { jobId, disallowed: disallow };
}

/** Disallow bersifat prefiks sederhana; "*" berarti seluruh path dilarang. */
export function isDisallowed(path: string, disallow: string[]): boolean {
  if (disallow.includes("*")) return true;
  return disallow.some((d) => path.startsWith(d));
}

/**
 * Jalankan satu batch kecil (bukan seluruh crawl dalam satu request).
 * Mengklaim item antrean secara atomik dengan UPDATE..RETURNING agar
 * dua eksekusi paralel tidak memproses URL yang sama.
 */
export async function runCrawlBatch(jobId: string): Promise<{
  processed: number;
  remaining: number;
  finished: boolean;
}> {
  const db = getDb();
  const jobRows = await db.select().from(crawlJobs).where(eq(crawlJobs.id, jobId)).limit(1);
  if (jobRows.length === 0) throw new CrawlError("JOB_NOT_FOUND");
  const job = jobRows[0];
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return { processed: 0, remaining: 0, finished: true };
  }

  const startHost = new URL(job.startUrl).hostname;
  const claimed = await db
    .update(crawlQueue)
    .set({ status: "running" })
    .where(
      inArray(
        crawlQueue.id,
        db
          .select({ id: crawlQueue.id })
          .from(crawlQueue)
          .where(and(eq(crawlQueue.jobId, jobId), eq(crawlQueue.status, "pending")))
          .orderBy(crawlQueue.depth)
          .limit(CRAWL_BATCH_SIZE),
      ),
    )
    .returning();

  let processed = 0;
  for (const item of claimed) {
    try {
      const res = await safeFetchHtml(item.url, {
        timeoutMs: CRAWL_URL_TIMEOUT_MS,
        maxBytes: CRAWL_MAX_RESPONSE_BYTES,
      });
      const isHtml = res.contentType.includes("text/html");
      const parsed = isHtml ? parsePageHtml(res.body, res.finalUrl) : null;

      const existing = await db
        .select({ id: crawlPages.id })
        .from(crawlPages)
        .where(and(eq(crawlPages.jobId, jobId), eq(crawlPages.urlHash, item.urlHash)))
        .limit(1);
      const isDuplicate = existing.length > 0;

      if (!isDuplicate) {
        await db.insert(crawlPages).values({
          jobId,
          urlHash: item.urlHash,
          url: res.finalUrl,
          statusCode: res.status,
          title: parsed?.title ?? null,
          metaDescription: parsed?.metaDescription ?? null,
          canonical: parsed?.canonical ?? null,
          metaRobots: parsed?.metaRobots ?? null,
          h1s: parsed?.h1s ?? [],
          h2Count: parsed?.h2Count ?? 0,
          h3Count: parsed?.h3Count ?? 0,
          internalLinks: parsed?.internalLinks ?? [],
          externalLinks: parsed?.externalLinks ?? [],
          imagesWithoutAlt: parsed?.imagesWithoutAlt ?? 0,
          isDuplicate: false,
        });
      } else {
        await db
          .update(crawlPages)
          .set({ isDuplicate: true })
          .where(and(eq(crawlPages.jobId, jobId), eq(crawlPages.urlHash, item.urlHash)));
      }

      // Antrikan internal link baru jika belum melewati batas & kedalaman.
      const foundCount = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(crawlPages)
        .where(eq(crawlPages.jobId, jobId));
      const currentFound = Number(foundCount[0]?.n ?? 0);
      if (parsed && currentFound + CRAWL_BATCH_SIZE <= job.maxUrls && item.depth < CRAWL_MAX_DEPTH) {
        const newLinks = parsed.internalLinks
          .filter((l) => {
            try {
              const u = new URL(l);
              return (
                u.hostname.toLowerCase() === startHost.toLowerCase() ||
                sameHost(l, job.startUrl)
              ) && !isDisallowed(u.pathname, job.settings?.disallow ?? []);
            } catch {
              return false;
            }
          })
          .map((l) => ({
            jobId,
            url: l,
            urlHash: urlHash(l),
            depth: item.depth + 1,
            status: "pending" as const,
          }));
        if (newLinks.length > 0) {
          await db
            .insert(crawlQueue)
            .values(newLinks)
            .onConflictDoNothing();
        }
      }

      await db
        .update(crawlQueue)
        .set({ status: "completed" })
        .where(eq(crawlQueue.id, item.id));
      processed++;
    } catch (e) {
      const code = e instanceof SsrfError ? `SSRF_${e.code}` : "FETCH_FAILED";
      await db
        .update(crawlQueue)
        .set({ status: "failed", error: code })
        .where(eq(crawlQueue.id, item.id));
      processed++;
    }
  }

  const [remainingRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(crawlQueue)
    .where(and(eq(crawlQueue.jobId, jobId), inArray(crawlQueue.status, ["pending", "running"])));
  const remaining = Number(remainingRow?.n ?? 0);

  const [pagesRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(crawlPages)
    .where(eq(crawlPages.jobId, jobId));
  const pagesDone = Number(pagesRow?.n ?? 0);

  const finished = remaining === 0 || pagesDone >= job.maxUrls;
  await db
    .update(crawlJobs)
    .set({
      urlsDone: pagesDone,
      urlsFound: pagesDone,
      status: finished ? "completed" : "running",
      finishedAt: finished ? new Date() : null,
    })
    .where(eq(crawlJobs.id, jobId));

  return { processed, remaining, finished };
}

/** Ringkasan temuan teknis dari hasil crawl (deterministik). */
export interface CrawlFindings {
  totalPages: number;
  httpErrors: { url: string; status: number }[];
  missingH1: string[];
  multipleH1: { url: string; count: number }[];
  duplicateTitles: { title: string; urls: string[] }[];
  duplicateDescriptions: { description: string; urls: string[] }[];
  missingMetaDescription: string[];
  longTitles: { url: string; length: number }[];
  longDescriptions: { url: string; length: number }[];
  canonicalMismatch: { url: string; canonical: string }[];
  noIndexPages: string[];
  imagesWithoutAltTotal: number;
  unreachableInternalLinks: string[];
}

export async function computeCrawlFindings(jobId: string): Promise<CrawlFindings> {
  const db = getDb();
  const pages = await db.select().from(crawlPages).where(eq(crawlPages.jobId, jobId));
  const byUrl = new Map(pages.map((p) => [p.url, p]));

  const titleMap = new Map<string, string[]>();
  const descMap = new Map<string, string[]>();
  for (const p of pages) {
    if (p.title) titleMap.set(p.title, [...(titleMap.get(p.title) ?? []), p.url]);
    if (p.metaDescription) descMap.set(p.metaDescription, [...(descMap.get(p.metaDescription) ?? []), p.url]);
  }

  const unreachable = new Set<string>();
  for (const p of pages) {
    for (const link of p.internalLinks ?? []) {
      // Link internal yang tidak tercapai = tidak ada di hasil crawl dengan status 2xx
      // dan belum tercatat sama sekali (bisa karena batas URL tercapai → indikator, bukan error pasti).
      if (!byUrl.has(link)) unreachable.add(link);
    }
  }

  return {
    totalPages: pages.length,
    httpErrors: pages
      .filter((p) => p.statusCode != null && p.statusCode >= 400)
      .map((p) => ({ url: p.url, status: p.statusCode! })),
    missingH1: pages.filter((p) => (p.h1s?.length ?? 0) === 0 && p.statusCode === 200).map((p) => p.url),
    multipleH1: pages
      .filter((p) => (p.h1s?.length ?? 0) > 1)
      .map((p) => ({ url: p.url, count: p.h1s!.length })),
    duplicateTitles: [...titleMap.entries()]
      .filter(([, urls]) => urls.length > 1)
      .map(([title, urls]) => ({ title, urls })),
    duplicateDescriptions: [...descMap.entries()]
      .filter(([, urls]) => urls.length > 1)
      .map(([description, urls]) => ({ description, urls })),
    missingMetaDescription: pages.filter((p) => !p.metaDescription && p.statusCode === 200).map((p) => p.url),
    longTitles: pages
      .filter((p) => p.title && [...p.title].length > 60)
      .map((p) => ({ url: p.url, length: [...p.title!].length })),
    longDescriptions: pages
      .filter((p) => p.metaDescription && [...p.metaDescription].length > 155)
      .map((p) => ({ url: p.url, length: [...p.metaDescription!].length })),
    canonicalMismatch: pages
      .filter((p) => p.canonical && normalizeUrl(p.canonical) !== normalizeUrl(p.url))
      .map((p) => ({ url: p.url, canonical: p.canonical! })),
    noIndexPages: pages
      .filter((p) => p.metaRobots && /noindex/i.test(p.metaRobots))
      .map((p) => p.url),
    imagesWithoutAltTotal: pages.reduce((a, p) => a + (p.imagesWithoutAlt ?? 0), 0),
    unreachableInternalLinks: [...unreachable].slice(0, 100),
  };
}
