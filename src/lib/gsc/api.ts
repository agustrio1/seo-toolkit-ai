import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { integrations } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto/token-crypto";
import { refreshAccessToken, GscOAuthError, type GoogleTokens } from "./oauth";

export class GscApiError extends Error {
  code: string;
  /** Pesan asli dari respons Google (bila ada) — untuk diagnosis, tanpa token. */
  detail?: string;
  constructor(code: string, detail?: string) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

/** Ambil pesan error dari respons Google; fallback ke status HTTP bila body bukan JSON error resmi. */
async function googleErrorDetail(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: { message?: string; status?: string } };
    const msg = body?.error?.message;
    const status = body?.error?.status;
    if (msg) return status ? `${msg} (${status})` : msg;
  } catch {
    // body bukan JSON (mis. halaman HTML 404) — jatuh ke fallback di bawah
  }
  return `HTTP ${res.status} ${res.statusText}`;
}

export function saveTokens(
  integrationId: string,
  tokens: GoogleTokens,
  property?: string,
): Promise<void> {
  const db = getDb();
  return db
    .update(integrations)
    .set({
      accessTokenEnc: encryptSecret(tokens.access_token),
      refreshTokenEnc: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : undefined,
      tokenExpiresAt: new Date(Date.now() + (tokens.expires_in - 60) * 1000),
      status: "connected",
      authorizedAt: new Date(),
      updatedAt: new Date(),
      ...(property ? { property } : {}),
    })
    .where(eq(integrations.id, integrationId))
    .then(() => undefined);
}

/** Ambil access token valid; refresh otomatis bila kedaluwarsa. */
export async function getValidAccessToken(integrationId: string): Promise<string> {
  const db = getDb();
  const rows = await db.select().from(integrations).where(eq(integrations.id, integrationId)).limit(1);
  if (rows.length === 0) throw new GscApiError("INTEGRATION_NOT_FOUND");
  const integ = rows[0];
  if (!integ.accessTokenEnc) throw new GscApiError("NO_TOKEN");
  if (integ.tokenExpiresAt && integ.tokenExpiresAt.getTime() > Date.now()) {
    return decryptSecret(integ.accessTokenEnc);
  }
  if (!integ.refreshTokenEnc) throw new GscApiError("TOKEN_EXPIRED");
  const refresh = decryptSecret(integ.refreshTokenEnc);
  try {
    const tokens = await refreshAccessToken(refresh);
    await saveTokens(integrationId, { ...tokens, refresh_token: tokens.refresh_token ?? refresh });
    return tokens.access_token;
  } catch (e) {
    await db
      .update(integrations)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(integrations.id, integrationId));
    if (e instanceof GscOAuthError) throw new GscApiError(e.code);
    throw new GscApiError("TOKEN_REFRESH_FAILED");
  }
}

export interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

/** Daftar properti yang dapat diakses akun Google yang terhubung. */
export async function fetchGscSites(accessToken: string): Promise<GscSite[]> {
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401 || res.status === 403) throw new GscApiError("GSC_FORBIDDEN", await googleErrorDetail(res));
  if (!res.ok) throw new GscApiError("GSC_SITES_FAILED", await googleErrorDetail(res));
  const json = (await res.json()) as { siteEntry?: GscSite[] };
  return json.siteEntry ?? [];
}

export interface GscQueryRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface PerformanceParams {
  siteUrl: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  dimensions: string[]; // e.g. ["query"], ["page"], ["query","page"]
  rowLimit?: number;
  startRow?: number;
  device?: string;
  country?: string;
  searchType?: "web" | "image" | "video" | "news" | "googleNewsDiscovery";
  dimensionFilter?: unknown;
}

/**
 * querySearchAnalytics resmi. Data bisa terlambat beberapa hari dan
 * query dengan volume sangat kecil dianonimisasi oleh Google.
 */
export async function fetchSearchAnalytics(
  accessToken: string,
  params: PerformanceParams,
): Promise<{ rows: GscQueryRow[] }> {
  const site = encodeURIComponent(params.siteUrl);
  const body: Record<string, unknown> = {
    startDate: params.startDate,
    endDate: params.endDate,
    dimensions: params.dimensions,
    rowLimit: Math.min(params.rowLimit ?? 250, 1000),
    startRow: params.startRow ?? 0,
  };
  if (params.device) body["dimensionFilters"] = [buildFilter("device", params.device)];
  if (params.country) {
    const existing = (body["dimensionFilters"] as unknown[]) ?? [];
    body["dimensionFilters"] = [...existing, buildFilter("country", params.country)];
  }
  if (params.searchType) body["searchType"] = params.searchType;
  if (params.dimensionFilter) {
    const existing = (body["dimensionFilters"] as unknown[]) ?? [];
    body["dimensionFilters"] = [...existing, params.dimensionFilter];
  }

  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (res.status === 401 || res.status === 403) throw new GscApiError("GSC_FORBIDDEN", await googleErrorDetail(res));
  if (res.status === 429) throw new GscApiError("GSC_QUOTA", await googleErrorDetail(res));
  if (!res.ok) throw new GscApiError("GSC_QUERY_FAILED", await googleErrorDetail(res));
  const json = (await res.json()) as { rows?: GscQueryRow[] };
  return { rows: json.rows ?? [] };
}

function buildFilter(dimension: string, value: string) {
  return { dimension, operator: "equals", expression: value };
}

/** Cari integrasi GSC aktif milik user pada project. */
export async function findUserGscIntegration(userId: string, projectId?: string) {
  const db = getDb();
  const conditions = [eq(integrations.userId, userId), eq(integrations.type, "gsc")];
  const rows = await db
    .select()
    .from(integrations)
    .where(
      projectId
        ? and(...conditions, eq(integrations.projectId, projectId))
        : and(...conditions),
    )
    .limit(1);
  return rows[0] ?? null;
}
