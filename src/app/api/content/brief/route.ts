import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { analyses, contentBriefs } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { assertProjectOwnership } from "@/lib/auth/ownership";
import { ok, fail, route, readJson } from "@/lib/api/response";
import { generateJson } from "@/lib/gemini/client";
import { buildBriefPrompt } from "@/lib/gemini/prompts";

export const runtime = "nodejs";

const schema = z.object({
  projectId: z.string().uuid(),
  topic: z.string().min(3).max(300),
  primaryKeyword: z.string().min(2).max(300),
  secondaryKeywords: z.string().max(1000).optional(),
  audience: z.string().max(300).optional(),
  intent: z.string().max(60).optional(),
  pageGoal: z.string().max(300).optional(),
  contentType: z.string().max(100).optional(),
  businessInfo: z.string().max(4000).optional(),
});

export const POST = route(async (req) => {
  const user = await requireSessionUser();
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return fail("INVALID_INPUT", "Data brief tidak valid.");
  const { projectId, ...fields } = parsed.data;
  await assertProjectOwnership(projectId, user.id);

  const ai = await generateJson({
    tool: "content_brief",
    ...buildBriefPrompt({ userId: user.id, projectId, ...fields }),
  });

  const db = getDb();
  const analysisRows = await db
    .insert(analyses)
    .values({
      userId: user.id,
      projectId,
      type: "content_brief",
      status: "completed",
      inputRef: { topic: fields.topic, primaryKeyword: fields.primaryKeyword },
      result: ai.data,
      summary: `Brief: ${ai.data.suggestedH1}`,
      model: ai.model,
      tokensIn: ai.tokensIn,
      tokensOut: ai.tokensOut,
      completedAt: new Date(),
    })
    .returning({ id: analyses.id });
  await db.insert(contentBriefs).values({
    projectId,
    title: fields.topic,
    primaryKeyword: fields.primaryKeyword,
    payload: ai.data,
    analysisId: analysisRows[0].id,
  });

  return ok({
    analysisId: analysisRows[0].id,
    brief: ai.data,
    note: "Brief ini rekomendasi AI berdasarkan input, bukan hasil SERP analysis (aplikasi ini tidak memiliki data SERP).",
  });
});
