import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { analyses } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { assertProjectOwnership } from "@/lib/auth/ownership";
import { ok, fail, route, readJson } from "@/lib/api/response";
import { analyzeContentDeterministic, densityStatus } from "@/lib/seo/analyze-text";
import { generateJson } from "@/lib/gemini/client";
import { buildContentAnalysisPrompt } from "@/lib/gemini/prompts";

export const runtime = "nodejs";

const schema = z.object({
  projectId: z.string().uuid().optional(),
  keyword: z.string().min(2).max(300),
  secondaryKeywords: z.string().max(1000).optional(),
  title: z.string().max(300).optional(),
  intent: z.string().max(60).optional(),
  content: z.string().min(50).max(100_000),
});

export const POST = route(async (req) => {
  const user = await requireSessionUser();
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) {
    return fail("INVALID_INPUT", "Konten minimal 50 karakter dan keyword wajib diisi (maks 100.000 karakter).");
  }
  const { projectId, keyword, content, title, secondaryKeywords, intent } = parsed.data;
  if (projectId) await assertProjectOwnership(projectId, user.id);

  const deterministic = analyzeContentDeterministic(content, keyword, { title });
  const summary = [
    `kata=${deterministic.wordCount}`,
    `exact keyword=${deterministic.exactKeywordOccurrences}`,
    `density=${deterministic.keywordDensityPercent}% (${densityStatus(deterministic.keywordDensityPercent)})`,
    deterministic.isHtml
      ? `H1=${deterministic.h1Count} H2=${deterministic.h2Count} H3=${deterministic.h3Count} heading kosong=${deterministic.emptyHeadings} link=${deterministic.linksFound} gambar tanpa alt=${deterministic.imagesWithoutAlt}`
      : "konten teks biasa: struktur heading tidak dapat disimpulkan",
    title ? `panjang title=${deterministic.titleLength}` : "title tidak diberikan",
    deterministic.metaDescriptionLength ? `panjang meta=${deterministic.metaDescriptionLength}` : "meta description tidak diberikan",
  ].join("; ");

  const db = getDb();
  const created = await db
    .insert(analyses)
    .values({
      userId: user.id,
      projectId,
      type: "content_analysis",
      status: "running",
      inputRef: { keyword, contentLength: content.length, title, hasProject: Boolean(projectId) },
    })
    .returning({ id: analyses.id });
  const analysisId = created[0].id;

  const ai = await generateJson({
    tool: "content_analysis",
    ...buildContentAnalysisPrompt({
      userId: user.id,
      projectId,
      keyword,
      secondaryKeywords,
      title,
      intent,
      deterministicSummary: summary,
      content,
    }),
  });

  await db
    .update(analyses)
    .set({
      status: "completed",
      result: { deterministic, ai: ai.data },
      summary: `Skor ${ai.data.seoScore}/100 — ${ai.data.verdict}`,
      model: ai.model,
      tokensIn: ai.tokensIn,
      tokensOut: ai.tokensOut,
      completedAt: new Date(),
    })
    .where(eq(analyses.id, analysisId));

  return ok({
    analysisId,
    deterministic,
    ai: ai.data,
    note: "Skor adalah rekomendasi asisten AI berdasarkan input, bukan skor ranking Google.",
  });
});
