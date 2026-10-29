import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { keywordItems } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { assertProjectOwnership } from "@/lib/auth/ownership";
import { route, fail } from "@/lib/api/response";
import { buildCsv } from "@/lib/seo/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "keyword", header: "keyword" },
  { key: "volume", header: "volume" },
  { key: "difficulty", header: "difficulty" },
  { key: "cpc", header: "cpc" },
  { key: "dataSource", header: "data_source" },
  { key: "dataDate", header: "data_date" },
  { key: "intent", header: "intent" },
  { key: "targetPage", header: "target_page" },
  { key: "notes", header: "notes" },
  { key: "tags", header: "tags" },
];

export const GET = route(async (req) => {
  const user = await requireSessionUser();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return fail("MISSING_PROJECT", "projectId wajib diisi.");
  await assertProjectOwnership(projectId, user.id);
  const db = getDb();
  const rows = await db.select().from(keywordItems).where(eq(keywordItems.projectId, projectId)).limit(5000);
  const csv = buildCsv(
    COLUMNS,
    rows.map((r) => ({
      keyword: r.keyword,
      volume: r.volume,
      difficulty: r.difficulty,
      cpc: r.cpc,
      dataSource: r.dataSource,
      dataDate: r.dataDate,
      intent: r.intent,
      targetPage: r.targetPage,
      notes: r.notes,
      tags: (r.tags ?? []).join("|"),
    })),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="keywords.csv"',
    },
  });
});
