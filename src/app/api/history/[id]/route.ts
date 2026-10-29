import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { analyses } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { ok, fail, route } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Detail satu analisis milik user (result penuh untuk ditampilkan). */
export const GET = route(async (_req, ctx) => {
  const user = await requireSessionUser();
  const { id } = await ctx.params;
  const db = getDb();
  const rows = await db.select().from(analyses).where(eq(analyses.id, id)).limit(1);
  if (rows.length === 0 || rows[0].userId !== user.id) {
    return fail("NOT_FOUND", "Analisis tidak ditemukan.", 404);
  }
  return ok({ analysis: rows[0] });
});
