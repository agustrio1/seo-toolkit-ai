import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bulkJobs, bulkJobItems } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { ok, fail, route } from "@/lib/api/response";
import { AiQuotaError } from "@/lib/gemini/client";
import { generateMetaForKeyword } from "@/lib/services/meta";

export const runtime = "nodejs";

/**
 * Eksekusi satu batch kecil (3 item) agar:
 * - aman untuk batas waktu function Vercel Hobby,
 * - menghormati RPM/TPM Gemini tier gratis,
 * - dapat dilanjutkan dari titik berhenti (resume).
 */
const BATCH = 3;

type MetaItemPayload = { keyword: string; pageUrl?: string; config?: Record<string, string | undefined> };

export const POST = route(async (_req, ctx) => {
  const user = await requireSessionUser();
  const { id } = await ctx.params;
  const db = getDb();

  const jobs = await db.select().from(bulkJobs).where(eq(bulkJobs.id, id)).limit(1);
  if (jobs.length === 0 || jobs[0].userId !== user.id) {
    return fail("NOT_FOUND", "Job tidak ditemukan.", 404);
  }
  const job = jobs[0];
  if (job.status === "completed" || job.status === "cancelled" || job.status === "failed") {
    return ok({ finished: true, status: job.status });
  }
  if (job.status === "queued") {
    await db
      .update(bulkJobs)
      .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
      .where(eq(bulkJobs.id, id));
  }

  // Klaim item secara atomik agar eksekusi paralel tidak dobel memproses.
  const claimed = await db
    .update(bulkJobItems)
    .set({ status: "running", claimedAt: new Date() })
    .where(
      inArray(
        bulkJobItems.id,
        db
          .select({ id: bulkJobItems.id })
          .from(bulkJobItems)
          .where(and(eq(bulkJobItems.jobId, id), eq(bulkJobItems.status, "pending")))
          .orderBy(bulkJobItems.ordinal)
          .limit(BATCH),
      ),
    )
    .returning();

  let okCount = 0;
  let failCount = 0;
  let quotaHit = false;

  for (const item of claimed) {
    const payload = item.payload as unknown as MetaItemPayload;
    try {
      const result = await generateMetaForKeyword({
        userId: user.id,
        projectId: job.projectId ?? undefined,
        keyword: payload.keyword,
        pageUrl: payload.pageUrl,
        audience: payload.config?.audience,
        businessName: payload.config?.businessName,
        style: payload.config?.style,
      });
      await db
        .update(bulkJobItems)
        .set({
          status: "completed",
          result: result as unknown as Record<string, unknown>,
          completedAt: new Date(),
        })
        .where(eq(bulkJobItems.id, item.id));
      okCount++;
    } catch (e) {
      if (e instanceof AiQuotaError) {
        // Kembalikan item ke antrian; lanjutkan nanti saat kuota reset.
        await db
          .update(bulkJobItems)
          .set({ status: "pending", claimedAt: null })
          .where(eq(bulkJobItems.id, item.id));
        quotaHit = true;
        break;
      }
      await db
        .update(bulkJobItems)
        .set({
          status: "failed",
          error: e instanceof Error ? e.message.slice(0, 190) : "FAILED",
          completedAt: new Date(),
        })
        .where(eq(bulkJobItems.id, item.id));
      failCount++;
    }
  }

  const [{ done }] = await db
    .select({ done: sql<number>`count(*)::int` })
    .from(bulkJobItems)
    .where(and(eq(bulkJobItems.jobId, id), inArray(bulkJobItems.status, ["completed", "failed"])));
  const [{ failed }] = await db
    .select({ failed: sql<number>`count(*)::int` })
    .from(bulkJobItems)
    .where(and(eq(bulkJobItems.jobId, id), eq(bulkJobItems.status, "failed")));

  const finished = Number(done) >= job.totalItems;
  await db
    .update(bulkJobs)
    .set({
      processedItems: Number(done),
      failedItems: Number(failed),
      status: finished ? "completed" : quotaHit ? "queued" : "running",
      finishedAt: finished ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(bulkJobs.id, id));

  return ok({
    batchProcessed: okCount + failCount,
    quotaHit,
    finished,
    message: quotaHit
      ? "Kuota AI tier gratis sedang tercapai. Job dihentikan sementara — jalankan batch berikutnya beberapa menit lagi atau setelah kuota harian reset."
      : undefined,
  });
});
