import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { assertProjectOwnership } from "@/lib/auth/ownership";
import { ok, fail, route, readJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  domain: z.string().min(3).max(300).optional(),
  description: z.string().max(2000).nullable().optional(),
  archived: z.boolean().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export const GET = route(async (_req, ctx) => {
  const user = await requireSessionUser();
  const { id } = await ctx.params;
  await assertProjectOwnership(id, user.id);
  const db = getDb();
  const rows = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, user.id))).limit(1);
  if (rows.length === 0) return fail("NOT_FOUND", "Project tidak ditemukan.", 404);
  return ok(rows[0]);
});

export const PATCH = route(async (req, ctx) => {
  const user = await requireSessionUser();
  const { id } = await ctx.params;
  await assertProjectOwnership(id, user.id);
  const parsed = patchSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail("INVALID_INPUT", "Data pembaruan tidak valid.");
  const db = getDb();
  const rows = await db
    .update(projects)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
    .returning();
  return ok(rows[0]);
});

export const DELETE = route(async (_req, ctx) => {
  // Penghapusan soft-archive; penghapusan permanen sengaja tidak disediakan lewat endpoint ini
  // agar tidak merusak riwayat (sesuai batas tindakan destruktif).
  const user = await requireSessionUser();
  const { id } = await ctx.params;
  await assertProjectOwnership(id, user.id);
  const db = getDb();
  await db
    .update(projects)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.userId, user.id)));
  return ok({ archived: true });
});
