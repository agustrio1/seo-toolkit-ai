import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { analyses } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { assertProjectOwnership } from "@/lib/auth/ownership";
import { ok, fail, route, readJson } from "@/lib/api/response";
import {
  getValidAccessToken,
  fetchSearchAnalytics,
  findUserGscIntegration,
  GscApiError,
  type GscQueryRow,
} from "@/lib/gsc/api";

export const runtime = "nodejs";

const schema = z.object({
  projectId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dimension: z.enum(["query", "page"]),
  device: z.enum(["DESKTOP", "MOBILE", "TABLET"]).optional(),
  country: z.string().length(2).optional(),
  rowLimit: z.number().int().min(10).max(1000).default(250),
});

/**
 * CTR agregat = total klik / total impresi (BUKAN rata-rata CTR baris).
 * Posisi agregat dihitung dengan pembobotan impresi (bukan rata-rata naif),
 * sesuai definisi metrik Search Console.
 */
export function aggregateRows(rows: GscQueryRow[]) {
  let clicks = 0;
  let impressions = 0;
  let weightedPos = 0;
  for (const r of rows) {
    clicks += r.clicks;
    impressions += r.impressions;
    weightedPos += r.position * r.impressions;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    avgPosition: impressions > 0 ? weightedPos / impressions : 0,
  };
}

export const POST = route(async (req) => {
  const user = await requireSessionUser();
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return fail("INVALID_INPUT", "Rentang tanggal atau filter tidak valid.");
  const { projectId, startDate, endDate, dimension, device, country, rowLimit } = parsed.data;
  if (startDate >= endDate) return fail("INVALID_INPUT", "startDate harus lebih awal dari endDate.");
  await assertProjectOwnership(projectId, user.id);

  const db = getDb();
  const integ = await findUserGscIntegration(user.id, projectId);
  if (!integ || integ.status !== "connected" || !integ.property) {
    return fail(
      "GSC_NOT_CONNECTED",
      "Belum ada properti Search Console terhubung untuk project ini. Buka Settings → Integrations.",
      400,
    );
  }

  let token: string;
  try {
    token = await getValidAccessToken(integ.id);
  } catch (e) {
    if (e instanceof GscApiError) {
      return fail(e.code, "Token Google kedaluwarsa. Hubungkan ulang akun di Settings → Integrations.", 401);
    }
    throw e;
  }

  try {
    const [dimsResult, dateResult] = await Promise.all([
      fetchSearchAnalytics(token, {
        siteUrl: integ.property,
        startDate,
        endDate,
        dimensions: [dimension],
        rowLimit,
        device,
        country,
      }),
      fetchSearchAnalytics(token, {
        siteUrl: integ.property,
        startDate,
        endDate,
        dimensions: ["date"],
        rowLimit: 90,
        device,
        country,
      }),
    ]);

    const totals = aggregateRows(dimsResult.rows);
    const series = dateResult.rows.map((r) => ({
      date: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }));

    const result = {
      property: integ.property,
      range: { startDate, endDate },
      totals,
      rows: dimsResult.rows.map((r) => ({
        dimensionValue: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      })),
      series,
      fetchedAt: new Date().toISOString(),
      notes: [
        "Data Search Console dapat terlambat beberapa hari.",
        "Query dengan volume sangat kecil dapat dianonimisasi oleh Google.",
        `Jumlah baris dibatasi ${rowLimit} per dimensi; gunakan export dari GSC untuk analisis penuh.`,
      ],
    };

    await db.insert(analyses).values({
      userId: user.id,
      projectId,
      type: "gsc_analysis",
      status: "completed",
      inputRef: { startDate, endDate, dimension, device, country },
      result: result as unknown as Record<string, unknown>,
      summary: `${totals.clicks} klik, ${totals.impressions} impresi (${dimension})`,
      completedAt: new Date(),
    });

    return ok(result);
  } catch (e) {
    if (e instanceof GscApiError) {
      const quota = e.code === "GSC_QUOTA";
      const base = quota ? "Kuota API Search Console tercapai. Coba lagi nanti." : "Gagal mengambil data dari Search Console.";
      return fail(e.code, e.detail ? `${base} — ${e.detail}` : base, quota ? 429 : 502);
    }
    throw e;
  }
});
