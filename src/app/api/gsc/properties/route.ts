import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { integrations } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { ok, fail, route } from "@/lib/api/response";
import { getValidAccessToken, fetchGscSites, GscApiError } from "@/lib/gsc/api";
import { gscConfigured } from "@/lib/gsc/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daftar properti GSC yang dapat diakses akun yang terhubung. */
export const GET = route(async () => {
  const user = await requireSessionUser();
  if (!gscConfigured()) return fail("GSC_NOT_CONFIGURED", "Integrasi belum dikonfigurasi di server.", 501);
  const db = getDb();
  const rows = await db
    .select()
    .from(integrations)
    .where(eq(integrations.userId, user.id))
    .limit(1);
  if (rows.length === 0 || rows[0].status !== "connected") {
    return fail("NOT_CONNECTED", "Hubungkan akun Google Search Console terlebih dahulu.", 400);
  }
  try {
    const token = await getValidAccessToken(rows[0].id);
    const sites = await fetchGscSites(token);
    return ok({ sites, current: rows[0].property });
  } catch (e) {
    if (e instanceof GscApiError) {
      const hints: Record<string, string> = {
        GSC_FORBIDDEN:
          "Google menolak akses (403). Pastikan 'Google Search Console API' sudah DIAKTIFKAN di project Google Cloud yang sama dengan OAuth client, dan akun Anda punya akses ke properti Search Console-nya.",
        GSC_SITES_FAILED: "Gagal mengambil daftar properti dari Search Console. Coba lagi beberapa saat.",
        TOKEN_EXPIRED: "Token akses sudah kedaluwarsa dan tidak bisa diperbarui. Hubungkan ulang akun Google Anda.",
        TOKEN_REFRESH_FAILED: "Gagal memperbarui token Google. Hubungkan ulang akun Google Anda.",
        NO_TOKEN: "Token belum tersimpan. Jalankan koneksi OAuth ulang dari halaman Integrasi.",
      };
      return fail(e.code, (hints[e.code] ?? "Gagal mengambil daftar properti dari Search Console.") + (e.detail ? ` — ${e.detail}` : ""), 502);
    }
    throw e;
  }
});
