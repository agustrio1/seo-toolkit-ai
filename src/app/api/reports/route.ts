import { z } from "zod";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { analyses, projects, reports } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { assertProjectOwnership } from "@/lib/auth/ownership";
import { ok, fail, route, readJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const generateSchema = z.object({
  projectId: z.string().uuid(),
  type: z.enum([
    "content_analysis",
    "keyword_clustering",
    "content_brief",
    "article_draft",
    "meta_generation",
    "geo_analysis",
    "internal_link_analysis",
    "technical_audit",
    "gsc_analysis",
  ]),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

/**
 * Report Generator. Snapshot berisi HANYA data nyata milik user yang sudah ada
 * di database (hasil analisis selesai). Tidak ada angka karangan.
 */
export const POST = route(async (req) => {
  const user = await requireSessionUser();
  const parsed = generateSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail("INVALID_INPUT", "Data pembuatan laporan tidak valid.");
  const { projectId, type, from, to } = parsed.data;
  await assertProjectOwnership(projectId, user.id);

  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

  const conds = [
    eq(analyses.userId, user.id),
    eq(analyses.projectId, projectId),
    eq(analyses.type, type),
    eq(analyses.status, "completed"),
  ];
  if (from) conds.push(gte(analyses.createdAt, new Date(from)));
  if (to) conds.push(lte(analyses.createdAt, new Date(to)));

  const rows = await db
    .select()
    .from(analyses)
    .where(and(...conds))
    .orderBy(desc(analyses.createdAt))
    .limit(200);

  if (rows.length === 0) {
    return fail("NO_DATA", "Belum ada hasil analisis selesai untuk tipe/periode ini. Jalankan modul terkait terlebih dahulu.");
  }

  const snapshot = {
    projectName: project?.name ?? null,
    type,
    period: { from: from ?? null, to: to ?? null },
    itemCount: rows.length,
    generatedAt: new Date().toISOString(),
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      model: r.model,
      summary: r.summary,
      result: r.result,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
    })),
    note: "Laporan ini adalah snapshot data hasil analisis tersimpan. Angka AI hanya muncul bila berasal dari hasil analisis tervalidasi, bukan estimasi langsung.",
  };

  const inserted = await db
    .insert(reports)
    .values({ userId: user.id, projectId, type, config: { from, to }, snapshot })
    .returning({ id: reports.id });

  return ok({ reportId: inserted[0].id, itemCount: rows.length });
});

/** Daftar laporan milik user. */
export const GET = route(async (req) => {
  const user = await requireSessionUser();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const db = getDb();
  const conds = [eq(reports.userId, user.id)];
  if (projectId) conds.push(eq(reports.projectId, projectId));
  const rows = await db
    .select({
      id: reports.id,
      projectId: reports.projectId,
      type: reports.type,
      createdAt: reports.createdAt,
      snapshot: reports.snapshot,
    })
    .from(reports)
    .where(and(...conds))
    .orderBy(desc(reports.createdAt))
    .limit(100);
  return ok({
    reports: rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      type: r.type,
      createdAt: r.createdAt,
      itemCount: typeof r.snapshot.itemCount === "number" ? r.snapshot.itemCount : null,
      generatedAt: typeof r.snapshot.generatedAt === "string" ? r.snapshot.generatedAt : null,
    })),
  });
});
