import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { reports } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { fail, route } from "@/lib/api/response";
import { buildCsv } from "@/lib/seo/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Export laporan ke CSV. Isi = snapshot tersimpan (data nyata).
 * Kolom detail bervariasi per tipe laporan, jadi result disertakan sebagai JSON
 * per baris — aman di-preview spreadsheet, dengan proteksi formula injection dari buildCsv.
 */
export const GET = route(async (req, ctx) => {
  const user = await requireSessionUser();
  const { id } = await ctx.params;
  const db = getDb();
  const rows = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  if (rows.length === 0 || rows[0].userId !== user.id) {
    return fail("NOT_FOUND", "Laporan tidak ditemukan.", 404);
  }
  const report = rows[0];
  const items = Array.isArray(report.snapshot.items) ? (report.snapshot.items as Record<string, unknown>[]) : [];
  const csv = buildCsv(
    [
      { header: "created_at", key: "created_at" },
      { header: "model", key: "model" },
      { header: "summary", key: "summary" },
      { header: "tokens_in", key: "tokens_in" },
      { header: "tokens_out", key: "tokens_out" },
      { header: "result_json", key: "result_json" },
    ],
    items.map((it) => ({
      created_at: it.createdAt,
      model: it.model,
      summary: it.summary,
      tokens_in: it.tokensIn,
      tokens_out: it.tokensOut,
      result_json: JSON.stringify(it.result ?? {}),
    })),
  );
  // buildCsv sudah menambahkan BOM Unicode.
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="report-${report.type}-${id.slice(0, 8)}.csv"`,
    },
  });
});
