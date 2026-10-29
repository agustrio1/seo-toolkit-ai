import { z } from "zod";
import { and, desc, eq, ilike, count, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { keywordItems, keywordLists } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { assertProjectOwnership } from "@/lib/auth/ownership";
import { ok, fail, paginated, route, readJson } from "@/lib/api/response";
import { normalizeKeyword } from "@/lib/seo/analyze-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const intentEnum = z.enum(["informational", "commercial", "transactional", "navigational"]);

/** Volume/difficulty/CPC hanya diterima bila dikirim pengguna + sumber datanya. Tidak pernah diisi AI. */
const itemSchema = z.object({
  keyword: z.string().min(1).max(300),
  listName: z.string().min(1).max(200).optional(),
  volume: z.number().int().min(0).max(100_000_000).nullish(),
  difficulty: z.number().int().min(0).max(100).nullish(),
  cpc: z.number().min(0).max(10000).nullish(),
  dataSource: z.string().max(100).nullish(),
  dataDate: z.string().max(30).nullish(),
  intent: intentEnum.nullish(),
  targetPage: z.string().max(500).nullish(),
  notes: z.string().max(2000).nullish(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

const addSchema = z.object({
  projectId: z.string().uuid(),
  items: z.array(itemSchema).min(1).max(1000),
});

export const GET = route(async (req) => {
  const user = await requireSessionUser();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return fail("MISSING_PROJECT", "Parameter projectId wajib diisi.");
  await assertProjectOwnership(projectId, user.id);

  const q = url.searchParams.get("q")?.trim();
  const intent = url.searchParams.get("intent");
  const page = Math.max(Number(url.searchParams.get("page") ?? "1"), 1);
  const perPage = Math.min(Math.max(Number(url.searchParams.get("perPage") ?? "50"), 1), 200);
  const sort = url.searchParams.get("sort") === "keyword" ? keywordItems.keyword : keywordItems.createdAt;

  const db = getDb();
  const conditions = [eq(keywordItems.projectId, projectId)];
  if (q) conditions.push(ilike(keywordItems.keyword, `%${q.slice(0, 100)}%`));
  if (intent && ["informational", "commercial", "transactional", "navigational"].includes(intent)) {
    conditions.push(sql`${keywordItems.intent} = ${intent}`);
  }
  const where = and(...conditions);

  const rows = await db
    .select()
    .from(keywordItems)
    .where(where)
    .orderBy(page === 1 && url.searchParams.get("sort") ? sort : desc(keywordItems.createdAt))
    .limit(perPage)
    .offset((page - 1) * perPage);
  const [{ n }] = await db.select({ n: count() }).from(keywordItems).where(where);
  return paginated(rows, { page, perPage, total: Number(n) });
});

export const POST = route(async (req) => {
  const user = await requireSessionUser();
  const parsed = addSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail("INVALID_INPUT", "Data keyword tidak valid (maks 1000 item per request).");
  const { projectId, items } = parsed.data;
  await assertProjectOwnership(projectId, user.id);
  const db = getDb();

  // Normalisasi + dedup dalam batch dan terhadap database.
  const seen = new Set<string>();
  const unique = items.filter((it) => {
    const n = normalizeKeyword(it.keyword);
    if (!n || seen.has(n)) return false;
    seen.add(n);
    return true;
  });

  // Resolve/buat list pertama jika ada listName.
  let listId: string | undefined;
  const firstListName = unique.find((i) => i.listName)?.listName;
  if (firstListName) {
    const existing = await db
      .select()
      .from(keywordLists)
      .where(and(eq(keywordLists.projectId, projectId), eq(keywordLists.name, firstListName)))
      .limit(1);
    if (existing.length > 0) {
      listId = existing[0].id;
    } else {
      const created = await db
        .insert(keywordLists)
        .values({ projectId, name: firstListName })
        .returning({ id: keywordLists.id });
      listId = created[0].id;
    }
  }

  const values = unique.map((it) => ({
    projectId,
    listId,
    keyword: it.keyword.trim(),
    normalized: normalizeKeyword(it.keyword),
    volume: it.volume ?? null,
    difficulty: it.difficulty ?? null,
    cpc: it.cpc != null ? String(it.cpc) : null,
    dataSource: it.dataSource ?? null,
    dataDate: it.dataDate ?? null,
    intent: it.intent ?? null,
    targetPage: it.targetPage ?? null,
    notes: it.notes ?? null,
    tags: it.tags ?? [],
  }));

  const inserted = await db
    .insert(keywordItems)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: keywordItems.id });
  return ok({ added: inserted.length, skippedDuplicates: values.length - inserted.length }, { status: 201 });
});
