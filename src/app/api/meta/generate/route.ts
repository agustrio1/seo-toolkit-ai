import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { analyses } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { assertProjectOwnership } from "@/lib/auth/ownership";
import { ok, fail, route, readJson } from "@/lib/api/response";
import { generateMetaForKeyword } from "@/lib/services/meta";

export const runtime = "nodejs";

const schema = z.object({
  projectId: z.string().uuid().optional(),
  keyword: z.string().min(2).max(300),
  audience: z.string().max(300).optional(),
  businessName: z.string().max(200).optional(),
  pageUrl: z.string().max(500).optional(),
  style: z.string().max(100).optional(),
});

export const POST = route(async (req) => {
  const user = await requireSessionUser();
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return fail("INVALID_INPUT", "Data tidak valid.");
  const { projectId, ...fields } = parsed.data;
  if (projectId) await assertProjectOwnership(projectId, user.id);

  const result = await generateMetaForKeyword({ userId: user.id, projectId, ...fields });

  // Simpan hasil ke riwayat agar dapat dibandingkan & di-export.
  const db = getDb();
  const created = await db
    .insert(analyses)
    .values({
      userId: user.id,
      projectId,
      type: "meta_generation",
      status: "completed",
      inputRef: { keyword: fields.keyword },
      result: result as unknown as Record<string, unknown>,
      summary: `Meta untuk: ${fields.keyword}`,
      completedAt: new Date(),
    })
    .returning({ id: analyses.id });

  return ok({ analysisId: created[0].id, ...result });
});
