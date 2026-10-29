import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bulkJobs, bulkJobItems } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { ok, fail, route } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (_req, ctx) => {
  const user = await requireSessionUser();
  const { id } = await ctx.params;
  const db = getDb();
  const jobs = await db
    .select()
    .from(bulkJobs)
    .where(eq(bulkJobs.id, id))
    .limit(1);
  if (jobs.length === 0 || jobs[0].userId !== user.id) {
    return fail("NOT_FOUND", "Job tidak ditemukan.", 404);
  }
  const items = await db
    .select()
    .from(bulkJobItems)
    .where(eq(bulkJobItems.jobId, id))
    .orderBy(bulkJobItems.ordinal);
  return ok({ job: jobs[0], items });
});
