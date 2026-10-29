import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bulkJobs } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { ok, fail, route } from "@/lib/api/response";

export const runtime = "nodejs";

export const POST = route(async (_req, ctx) => {
  const user = await requireSessionUser();
  const { id } = await ctx.params;
  const db = getDb();
  const rows = await db
    .update(bulkJobs)
    .set({ status: "cancelled", finishedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(bulkJobs.id, id), eq(bulkJobs.userId, user.id)))
    .returning();
  if (rows.length === 0) return fail("NOT_FOUND", "Job tidak ditemukan.", 404);
  return ok({ cancelled: true });
});
