import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { integrations } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth/sessions";
import { route, fail } from "@/lib/api/response";
import {
  readOauthCookies,
  clearOauthCookies,
  verifyState,
  exchangeCode,
  GscOAuthError,
} from "@/lib/gsc/oauth";
import { saveTokens } from "@/lib/gsc/api";

export const runtime = "nodejs";

export const GET = route(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const { state: cookieState, verifier } = await readOauthCookies();
  await clearOauthCookies();

  if (error) {
    return NextResponse.redirect(appUrl(`/settings/integrations?gsc=cancelled`));
  }
  if (!code || !state || !cookieState) {
    // Biasanya terjadi karena URL lama dibuka ulang (back/refres) — code hanya sekali pakai.
    return NextResponse.redirect(appUrl(`/settings/integrations?gsc=error&code=INVALID_CALLBACK`));
  }
  // Validasi state: HMAC valid, cocok dengan cookie, dan terikat sesi login saat ini.
  const payload = verifyState(state);
  if (!payload || state !== cookieState) {
    return fail("INVALID_STATE", "State OAuth tidak valid (possible CSRF). Hubungkan ulang.");
  }
  const userId = payload.slice(0, payload.lastIndexOf("."));
  const sessionUser = await getSessionUser();
  if (!sessionUser || sessionUser.id !== userId) {
    return fail("SESSION_MISMATCH", "Sesi berubah saat OAuth berlangsung. Hubungkan ulang.");
  }

  const db = getDb();
  const integRows = await db
    .select()
    .from(integrations)
    .where(eq(integrations.userId, userId))
    .limit(1);
  if (integRows.length === 0) {
    return fail("NO_INTEGRATION", "Koneksi belum dimulai dari aplikasi.", 400);
  }

  try {
    const tokens = await exchangeCode(code, verifier);
    await saveTokens(integRows[0].id, tokens);
    return NextResponse.redirect(appUrl(`/settings/integrations?gsc=connected`));
  } catch (e) {
    if (e instanceof GscOAuthError) {
      return NextResponse.redirect(appUrl(`/settings/integrations?gsc=error&code=${e.code}`));
    }
    throw e;
  }
});

function appUrl(path: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return new URL(path, base).toString();
}
