import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { analyses, contentBriefs } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { assertProjectOwnership } from "@/lib/auth/ownership";
import { ok, fail, route, readJson } from "@/lib/api/response";
import { generateJsonWithRepair } from "@/lib/gemini/client";
import { buildArticlePrompt } from "@/lib/gemini/prompts";

export const runtime = "nodejs";

const schema = z.object({
  projectId: z.string().uuid(),
  briefId: z.string().uuid().optional(),
  briefJson: z.string().max(30_000).optional(),
  targetWords: z.number().int().min(200).max(3000).default(800),
  regenerateHeading: z.string().max(300).optional(),
  previousArticleId: z.string().uuid().optional(),
});

export const POST = route(async (req) => {
  const user = await requireSessionUser();
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return fail("INVALID_INPUT", "Data generator tidak valid.");
  const { projectId, briefId, briefJson, targetWords, regenerateHeading, previousArticleId } = parsed.data;
  await assertProjectOwnership(projectId, user.id);

  let brief = briefJson;
  if (!brief && briefId) {
    const db = getDb();
    const rows = await db
      .select()
      .from(contentBriefs)
      .where(and(eq(contentBriefs.id, briefId), eq(contentBriefs.projectId, projectId)))
      .limit(1);
    if (rows.length === 0) return fail("NOT_FOUND", "Brief tidak ditemukan.", 404);
    brief = JSON.stringify(rows[0].payload);
  }
  if (regenerateHeading && previousArticleId) {
    // Kirim artikel sebelumnya sebagai bagian brief agar revisi sebagian konsisten.
    const db = getDb();
    const prev = await db.select().from(analyses).where(eq(analyses.id, previousArticleId)).limit(1);
    if (prev.length > 0 && prev[0].userId === user.id) {
      brief = JSON.stringify({ brief: brief ? JSON.parse(brief) : {}, previousArticle: prev[0].result });
    }
  }
  if (!brief) return fail("INVALID_INPUT", "briefId atau briefJson wajib diisi.");

  const ai = await generateJsonWithRepair({
    tool: "article_draft",
    ...buildArticlePrompt({ userId: user.id, projectId, briefJson: brief, targetWords, regenerateHeading }),
  });

  const db = getDb();
  const created = await db
    .insert(analyses)
    .values({
      userId: user.id,
      projectId,
      type: "article_draft",
      status: "completed",
      inputRef: { targetWords, regenerateHeading: regenerateHeading ?? null },
      result: ai.data,
      summary: `Draft: ${ai.data.title}`,
      model: ai.model,
      tokensIn: ai.tokensIn,
      tokensOut: ai.tokensOut,
      completedAt: new Date(),
    })
    .returning({ id: analyses.id });

  return ok({
    articleId: created[0].id,
    article: ai.data,
    note: "Periksa claimsToVerify sebelum publikasi; artikel tidak boleh memuat klaim faktual yang belum diverifikasi.",
  });
});
