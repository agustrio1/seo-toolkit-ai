import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { analyses, keywordClusters, keywordItems, clusterMembers } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { assertProjectOwnership } from "@/lib/auth/ownership";
import { ok, fail, route, readJson } from "@/lib/api/response";
import { generateJson } from "@/lib/gemini/client";
import { buildClusteringPrompt } from "@/lib/gemini/prompts";
import { normalizeKeyword } from "@/lib/seo/analyze-text";

export const runtime = "nodejs";

const schema = z.object({
  projectId: z.string().uuid(),
  keywordIds: z.array(z.string().uuid()).min(2).max(300).optional(),
});

export const POST = route(async (req) => {
  const user = await requireSessionUser();
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return fail("INVALID_INPUT", "Pilih minimal 2 keyword dari workspace.");
  const { projectId, keywordIds } = parsed.data;
  await assertProjectOwnership(projectId, user.id);

  const db = getDb();
  // keywordIds dikirim user ( hasil seleksi di workspace); bila tidak ada,
  // pakai seluruh keyword project (dibatasi 300 agar hemat kuota free tier).
  const items = keywordIds
    ? await db
        .select()
        .from(keywordItems)
        .where(and(eq(keywordItems.projectId, projectId), inArray(keywordItems.id, keywordIds)))
    : await db
        .select()
        .from(keywordItems)
        .where(eq(keywordItems.projectId, projectId))
        .limit(300);
  if (items.length < 2) return fail("INVALID_INPUT", "Keyword tidak ditemukan atau bukan milik project ini.");

  const inputKeywords = items.map((i) => i.keyword);
  const byNormalized = new Map(items.map((i) => [normalizeKeyword(i.keyword), i]));

  const ai = await generateJson({
    tool: "keyword_clustering",
    ...buildClusteringPrompt({ userId: user.id, projectId, keywords: inputKeywords }),
  });

  // Validasi: keyword hasil clustering harus berasal dari input.
  const consumed = new Set<string>();
  const cleanClusters: typeof ai.data.clusters = [];
  for (const c of ai.data.clusters) {
    const validKw = c.keywords.filter((k) => {
      const n = normalizeKeyword(k);
      return byNormalized.has(n) && !consumed.has(n);
    });
    if (validKw.length > 0) {
      validKw.forEach((k) => consumed.add(normalizeKeyword(k)));
      cleanClusters.push({ ...c, keywords: validKw });
    }
  }
  const unassigned = [
    ...ai.data.unassignedKeywords.filter((k) => {
      const n = normalizeKeyword(k);
      return byNormalized.has(n) && !consumed.has(n);
    }),
    // Keyword input yang hilang dari output AI dianggap belum terpetakan.
    ...inputKeywords.filter((k) => {
      const n = normalizeKeyword(k);
      return !consumed.has(n) && !ai.data.unassignedKeywords.some((u) => normalizeKeyword(u) === n);
    }),
  ];

  const created = await db
    .insert(analyses)
    .values({
      userId: user.id,
      projectId,
      type: "keyword_clustering",
      status: "completed",
      inputRef: { keywordCount: inputKeywords.length },
      result: ai.data,
      summary: `${cleanClusters.length} cluster, ${unassigned.length} belum terpetakan`,
      model: ai.model,
      tokensIn: ai.tokensIn,
      tokensOut: ai.tokensOut,
      completedAt: new Date(),
    })
    .returning({ id: analyses.id });
  const analysisId = created[0].id;

  for (const c of cleanClusters) {
    const clusterRows = await db
      .insert(keywordClusters)
      .values({
        projectId,
        analysisId,
        clusterName: c.clusterName,
        intent: c.intent,
        primaryKeyword: c.primaryKeyword,
        suggestedPageType: c.suggestedPageType,
        reasoning: c.reasoning,
      })
      .returning({ id: keywordClusters.id });
    const clusterId = clusterRows[0].id;
    const memberIds = c.keywords
      .map((k) => byNormalized.get(normalizeKeyword(k))?.id)
      .filter((id): id is string => Boolean(id));
    if (memberIds.length > 0) {
      await db
        .insert(clusterMembers)
        .values(memberIds.map((keywordItemId) => ({ clusterId, keywordItemId })))
        .onConflictDoNothing();
    }
  }

  return ok({
    analysisId,
    clusters: cleanClusters,
    unassigned,
    note: "Perhatikan intent tiap cluster; kemiripan kata tidak otomatis berarti harus digabung.",
  });
});
