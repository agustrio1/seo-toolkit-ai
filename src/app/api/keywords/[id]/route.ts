import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { keywordItems, projects } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { ok, fail, route, readJson } from "@/lib/api/response";
import { normalizeKeyword } from "@/lib/seo/analyze-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  keyword: z.string().min(1).max(300).optional(),
  volume: z.number().int().min(0).max(100_000_000).nullish(),
  difficulty: z.number().int().min(0).max(100).nullish(),
  cpc: z.number().min(0).max(10000).nullish(),
  intent: z.enum(["informational", "commercial", "transactional", "navigational"]).nullish(),
  targetPage: z.string().max(500).nullish(),
  notes: z.string().max(2000).nullish(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

async function findOwned(id: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select({ item: keywordItems, owner: projects.userId })
    .from(keywordItems)
    .innerJoin(projects, eq(projects.id, keywordItems.projectId))
    .where(eq(keywordItems.id, id))
    .limit(1);
  if (rows.length === 0 || rows[0].owner !== userId) return null;
  return rows[0].item;
}

export const PATCH = route(async (req, ctx) => {
  const user = await requireSessionUser();
  const { id } = await ctx.params;
  const item = await findOwned(id, user.id);
  if (!item) return fail("NOT_FOUND", "Keyword tidak ditemukan.", 404);
  const parsed = patchSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail("INVALID_INPUT", "Data pembaruan tidak valid.");
  const db = getDb();
  const d = parsed.data;
  const rows = await db
    .update(keywordItems)
    .set({
      ...(d.keyword ? { keyword: d.keyword.trim(), normalized: normalizeKeyword(d.keyword) } : {}),
      ...(d.volume !== undefined ? { volume: d.volume } : {}),
      ...(d.difficulty !== undefined ? { difficulty: d.difficulty } : {}),
      ...(d.cpc !== undefined ? { cpc: d.cpc != null ? String(d.cpc) : null } : {}),
      ...(d.intent !== undefined ? { intent: d.intent } : {}),
      ...(d.targetPage !== undefined ? { targetPage: d.targetPage } : {}),
      ...(d.notes !== undefined ? { notes: d.notes } : {}),
      ...(d.tags !== undefined ? { tags: d.tags } : {}),
    })
    .where(and(eq(keywordItems.id, id), eq(keywordItems.projectId, item.projectId)))
    .returning();
  return ok(rows[0]);
});

export const DELETE = route(async (_req, ctx) => {
  const user = await requireSessionUser();
  const { id } = await ctx.params;
  const item = await findOwned(id, user.id);
  if (!item) return fail("NOT_FOUND", "Keyword tidak ditemukan.", 404);
  const db = getDb();
  await db.delete(keywordItems).where(eq(keywordItems.id, id));
  return ok({ deleted: true });
});
