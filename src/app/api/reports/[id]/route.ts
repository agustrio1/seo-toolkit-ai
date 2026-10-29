import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { reports } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { ok, fail, route } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Detail laporan — hanya milik user bersangkutan. */
export const GET = route(async (req, ctx) => {
  const user = await requireSessionUser();
  const { id } = await ctx.params;
  const db = getDb();
  const rows = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  if (rows.length === 0 || rows[0].userId !== user.id) {
    return fail("NOT_FOUND", "Laporan tidak ditemukan.", 404);
  }
  return ok({ report: rows[0] });
});
