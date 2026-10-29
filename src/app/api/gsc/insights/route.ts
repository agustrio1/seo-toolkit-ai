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
  aggregateRows,
  GscApiError,
  type GscQueryRow,
} from "@/lib/gsc/api";

export const runtime = "nodejs";

const schema = z.object({
  projectId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  device: z.enum(["DESKTOP", "MOBILE", "TABLET"]).optional(),
});

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Periode pembanding = sepanjang rentang aktif, tepat sebelum startDate. */
export function previousRange(startDate: string, endDate: string) {
  const s = new Date(startDate + "T00:00:00Z");
  const e = new Date(endDate + "T00:00:00Z");
  const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
  const prevEnd = new Date(s.getTime() - 86_400_000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86_400_000);
  return { startDate: isoDate(prevStart), endDate: isoDate(prevEnd) };
}

interface QuickWin {
  query: string;
  page: string | null;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  /** Proyeksi klik bila naik ke posisi ≤3, memakai CTR nyata query posisi ≤3 milik sendiri. */
  potentialClicks: number | null;
}

interface Mover {
  query: string;
  cur: { clicks: number; impressions: number; position: number };
  prev: { clicks: number; impressions: number; position: number };
  dPosition: number; // positif = memburuk? tidak: prev - cur, positif = MEMBAIK
  dClicks: number;
}

/** Median CTR baris posisi ≤3 (impressi ≥10) dari data user sendiri — dasar proyeksi, bukan benchmark karangan. */
function benchmarkCtr(rows: GscQueryRow[]): number | null {
  const ctrs = rows
    .filter((r) => r.position > 0 && r.position <= 3 && r.impressions >= 10)
    .map((r) => r.ctr)
    .sort((a, b) => a - b);
  if (ctrs.length === 0) return null;
  const mid = Math.floor(ctrs.length / 2);
  return ctrs.length % 2 ? ctrs[mid] : (ctrs[mid - 1] + ctrs[mid]) / 2;
}

export const POST = route(async (req) => {
  const user = await requireSessionUser();
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return fail("INVALID_INPUT", "Rentang tanggal tidak valid.");
  const { projectId, startDate, endDate, device } = parsed.data;
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

  const prev = previousRange(startDate, endDate);

  try {
    const [curQuery, prevQuery, curQueryPage] = await Promise.all([
      fetchSearchAnalytics(token, {
        siteUrl: integ.property, startDate, endDate,
        dimensions: ["query"], rowLimit: 1000, device,
      }),
      fetchSearchAnalytics(token, {
        siteUrl: integ.property, startDate: prev.startDate, endDate: prev.endDate,
        dimensions: ["query"], rowLimit: 1000, device,
      }),
      // Dimensi ganda: tahu halaman mana yang perlu diperbaiki untuk tiap query.
      fetchSearchAnalytics(token, {
        siteUrl: integ.property, startDate, endDate,
        dimensions: ["query", "page"], rowLimit: 1000, device,
      }),
    ]);

    // Peta halaman terbaik (impressi terbanyak) per query dari data query+page.
    const pageByQuery = new Map<string, { page: string; position: number }>();
    const maxImprByQuery = new Map<string, number>();
    for (const r of curQueryPage.rows) {
      const [q, p] = r.keys;
      const seen = maxImprByQuery.get(q) ?? -1;
      if (r.impressions > seen) {
        maxImprByQuery.set(q, r.impressions);
        pageByQuery.set(q, { page: p, position: r.position });
      }
    }

    const bench = benchmarkCtr(curQuery.rows);

    const quickWins: QuickWin[] = curQuery.rows
      .filter((r) => r.position >= 4 && r.position <= 15 && r.impressions >= 5)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 30)
      .map((r) => ({
        query: r.keys[0],
        page: pageByQuery.get(r.keys[0])?.page ?? null,
        position: r.position,
        impressions: r.impressions,
        clicks: r.clicks,
        ctr: r.ctr,
        potentialClicks: bench !== null ? Math.round(r.impressions * bench) : null,
      }));

    // Movers: gabung query saat ini vs periode sebelumnya.
    const prevMap = new Map(prevQuery.rows.map((r) => [r.keys[0], r]));
    const movers: Mover[] = [];
    for (const c of curQuery.rows) {
      const p = prevMap.get(c.keys[0]);
      if (!p) continue;
      const dPos = p.position - c.position; // positif = posisi membaik (mengecil)
      if (Math.abs(dPos) < 1) continue;
      movers.push({
        query: c.keys[0],
        cur: { clicks: c.clicks, impressions: c.impressions, position: c.position },
        prev: { clicks: p.clicks, impressions: p.impressions, position: p.position },
        dPosition: dPos,
        dClicks: c.clicks - p.clicks,
      });
    }
    const risers = movers.filter((m) => m.dPosition > 0).sort((a, b) => b.dPosition - a.dPosition).slice(0, 10);
    const decliners = movers.filter((m) => m.dPosition < 0).sort((a, b) => a.dPosition - b.dPosition).slice(0, 10);

    const totalsCur = aggregateRows(curQuery.rows);
    const totalsPrev = aggregateRows(prevQuery.rows);

    const result = {
      property: integ.property,
      range: { current: { startDate, endDate }, previous: prev },
      totals: {
        current: totalsCur,
        previous: totalsPrev,
        delta: {
          clicks: totalsCur.clicks - totalsPrev.clicks,
          impressions: totalsCur.impressions - totalsPrev.impressions,
          position: totalsCur.avgPosition - totalsPrev.avgPosition,
        },
      },
      benchmarkCtr: bench,
      quickWins,
      movers: { risers, decliners },
      notes: [
        "Semua angka berasal dari API resmi GSC properti Anda — bukan estimasi.",
        "Proyeksi klik memakai CTR median query posisi ≤3 MILIK ANDA SENDIRI; kosong bila datanya belum cukup.",
        `Perbandingan memakai periode sebelumnya: ${prev.startDate} s/d ${prev.endDate}.`,
        "Query dengan volume sangat kecil dapat dianonimisasi Google; baris baru/hilang tidak dihitung sebagai mover.",
      ],
      fetchedAt: new Date().toISOString(),
    };

    await db.insert(analyses).values({
      userId: user.id,
      projectId,
      type: "gsc_analysis",
      status: "completed",
      inputRef: { startDate, endDate, device, kind: "insights" },
      result: result as unknown as Record<string, unknown>,
      summary: `${quickWins.length} peluang quick win, ${decliners.length} query melemah`,
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
