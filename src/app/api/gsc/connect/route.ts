import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { integrations } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { route, fail } from "@/lib/api/response";
import { startGscOAuth, gscConfigured, GscOAuthError } from "@/lib/gsc/oauth";

export const runtime = "nodejs";

/**
 /api/gsc/connect?projectId=... → redirect ke Google OAuth consent.
 Konsep login Google dan izin Search Console dipisahkan: koneksi ini hanya
 meminta scope webmasters.readonly atas nama user yang sudah login ke aplikasi.
*/
export const GET = route(async (req) => {
  const user = await requireSessionUser();
  if (!gscConfigured()) {
    return fail(
      "GSC_NOT_CONFIGURED",
      "Integrasi Google Search Console belum dikonfigurasi. Isi GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, dan GOOGLE_REDIRECT_URI pada environment server, lalu aktifkan Search Console API di Google Cloud.",
      501,
    );
  }
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const db = getDb();

  // Baris integrasi per user (satu koneksi Google per user; properti dipetakan per project).
  const existing = await db
    .select()
    .from(integrations)
    .where(eq(integrations.userId, user.id))
    .limit(1);
  if (existing.length === 0) {
    const created = await db
      .insert(integrations)
      .values({ userId: user.id, projectId: projectId ?? undefined, type: "gsc", status: "disconnected" })
      .returning({ id: integrations.id });
    void created;
  } else if (projectId && !existing[0].projectId) {
    await db
      .update(integrations)
      .set({ projectId, updatedAt: new Date() })
      .where(eq(integrations.id, existing[0].id));
  }

  try {
    const authUrl = await startGscOAuth(user.id);
    return NextResponse.redirect(authUrl);
  } catch (e) {
    if (e instanceof GscOAuthError) {
      return fail(e.code, "Gagal memulai koneksi Google Search Console.", 500);
    }
    throw e;
  }
});
