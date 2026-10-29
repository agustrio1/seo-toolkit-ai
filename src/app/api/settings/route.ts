import { z } from "zod";
import { and, eq, lt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { userPreferences, analyses } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { ok, fail, route, readJson } from "@/lib/api/response";
import { GEMINI_MODEL_ALLOWLIST } from "@/lib/gemini/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prefsSchema = z.object({
  defaultProjectId: z.string().uuid().nullable().optional(),
  preferences: z
    .object({
      model: z.enum(GEMINI_MODEL_ALLOWLIST).optional(),
      language: z.enum(["id", "en"]).optional(),
      outputLength: z.enum(["short", "medium", "long"]).optional(),
      crawlMaxUrls: z.number().int().min(1).max(50).optional(),
      historyRetentionDays: z.number().int().min(30).max(730).optional(),
      reportPreference: z.enum(["html", "csv"]).optional(),
    })
    .optional(),
});

async function getOrCreate(userId: string) {
  const db = getDb();
  const rows = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  if (rows.length > 0) return rows[0];
  const created = await db
    .insert(userPreferences)
    .values({ userId })
    .returning();
  return created[0];
}

export const GET = route(async () => {
  const user = await requireSessionUser();
  const prefs = await getOrCreate(user.id);
  return ok({
    email: user.email,
    name: user.name,
    defaultProjectId: prefs.defaultProjectId,
    preferences: prefs.preferences,
    allowedModels: GEMINI_MODEL_ALLOWLIST,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  });
});

export const PUT = route(async (req) => {
  const user = await requireSessionUser();
  const parsed = prefsSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail("INVALID_INPUT", "Pengaturan tidak valid (model harus dari daftar yang diizinkan).");
  const existing = await getOrCreate(user.id);
  const db = getDb();
  await db
    .update(userPreferences)
    .set({
      defaultProjectId: parsed.data.defaultProjectId ?? existing.defaultProjectId,
      preferences: { ...(existing.preferences ?? {}), ...(parsed.data.preferences ?? {}) },
      updatedAt: new Date(),
    })
    .where(eq(userPreferences.userId, user.id));
  return ok({ saved: true });
});

/** Hapus riwayat milik sendiri (retensi). */
export const DELETE = route(async (req) => {
  const user = await requireSessionUser();
  const url = new URL(req.url);
  const olderThanDays = Number(url.searchParams.get("olderThanDays") ?? "0");
  if (olderThanDays < 0) return fail("INVALID_INPUT", "olderThanDays tidak valid.");
  const db = getDb();
  // olderThanDays=0 berarti hapus SEMUA riwayat milik user; selain itu hanya yang lebih tua.
  const where =
    olderThanDays === 0
      ? eq(analyses.userId, user.id)
      : and(eq(analyses.userId, user.id), lt(analyses.createdAt, new Date(Date.now() - olderThanDays * 86_400_000)));
  const deleted = await db.delete(analyses).where(where).returning({ id: analyses.id });
  return ok({ deletedCount: deleted.length });
});
