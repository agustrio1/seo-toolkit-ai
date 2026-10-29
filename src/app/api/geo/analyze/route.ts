import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { analyses } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { assertProjectOwnership } from "@/lib/auth/ownership";
import { ok, fail, route, readJson } from "@/lib/api/response";
import { generateJson } from "@/lib/gemini/client";
import { buildGeoPrompt } from "@/lib/gemini/prompts";
import { parsePageHtml } from "@/lib/crawl/parse-page";

export const runtime = "nodejs";

const schema = z.object({
  projectId: z.string().uuid(),
  keyword: z.string().min(2).max(300),
  content: z.string().min(50).max(80_000),
  businessInfo: z.string().max(2000).optional(),
});

export const POST = route(async (req) => {
  const user = await requireSessionUser();
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return fail("INVALID_INPUT", "Data GEO tidak valid.");
  const { projectId, keyword, content, businessInfo } = parsed.data;
  await assertProjectOwnership(projectId, user.id);

  // Jika HTML, parse schema markup secara nyata; jika teks biasa, tidak ada schema.
  const looksHtml = /<\/?[a-z][\s\S]*>/i.test(content);
  const schemaTypesFound = looksHtml ? parsePageHtml(content, "https://example.invalid/").jsonLdTypes : [];

  const ai = await generateJson({
    tool: "geo_analysis",
    ...buildGeoPrompt({ userId: user.id, projectId, keyword, content, schemaTypesFound, businessInfo }),
  });

  const db = getDb();
  const created = await db
    .insert(analyses)
    .values({
      userId: user.id,
      projectId,
      type: "geo_analysis",
      status: "completed",
      inputRef: { keyword, contentLength: content.length },
      result: ai.data,
      summary: `GEO readiness ${ai.data.readinessScore}/100`,
      model: ai.model,
      tokensIn: ai.tokensIn,
      tokensOut: ai.tokensOut,
      completedAt: new Date(),
    })
    .returning({ id: analyses.id });

  return ok({
    analysisId: created[0].id,
    geo: ai.data,
    schemaTypesFound,
    note: "Ini analisis KESIAPAN konten untuk mesin generatif — bukan laporan ranking AI dan tidak menjamin dikutip AI Overviews.",
  });
});
