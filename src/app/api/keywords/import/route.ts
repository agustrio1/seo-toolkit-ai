import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { keywordItems, keywordLists } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { assertProjectOwnership } from "@/lib/auth/ownership";
import { ok, fail, route, readJson } from "@/lib/api/response";
import { parseCsvUpload, CsvError } from "@/lib/seo/csv";
import { normalizeKeyword } from "@/lib/seo/analyze-text";

export const runtime = "nodejs";

const schema = z.object({
  projectId: z.string().uuid(),
  listName: z.string().min(1).max(200).default("Import CSV"),
  csv: z.string().min(1).max(2_000_000),
  preview: z.boolean().default(false),
});

/**
 * Import CSV keyword. Kolom wajib: keyword. Kolom opsional:
 * volume, difficulty, cpc, data_source, data_date, intent, target_page, notes, tags.
 * Volume/difficulty/CPC HANYA dari baris CSV pengguna — tidak pernah diisi otomatis.
 * preview=true mengembalikan ringkasan tanpa menyimpan.
 */
export const POST = route(async (req) => {
  const user = await requireSessionUser();
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return fail("INVALID_INPUT", "Data import tidak valid.");
  const { projectId, listName, csv, preview } = parsed.data;
  await assertProjectOwnership(projectId, user.id);

  let result;
  try {
    result = parseCsvUpload(csv, ["keyword"]);
  } catch (e) {
    if (e instanceof CsvError) return fail(e.code, e.publicMessage);
    throw e;
  }

  const intentValues = ["informational", "commercial", "transactional", "navigational"] as const;
  type Intent = (typeof intentValues)[number];
  const cleaned = [];
  const invalidRows: string[] = [];
  const seen = new Set<string>();
  for (const row of result.rows) {
    const kw = (row["keyword"] ?? "").trim();
    if (!kw || kw.length > 300) {
      invalidRows.push(`Keyword kosong/terlalu panjang: "${(row["keyword"] ?? "").slice(0, 40)}"`);
      continue;
    }
    const n = normalizeKeyword(kw);
    if (seen.has(n)) continue;
    seen.add(n);
    const volRaw = (row["volume"] ?? "").trim();
    const vol = volRaw ? Number(volRaw.replace(/[^\d.]/g, "")) : null;
    const diffRaw = (row["difficulty"] ?? "").trim();
    const diff = diffRaw ? Number(diffRaw.replace(/[^\d.]/g, "")) : null;
    const cpcRaw = (row["cpc"] ?? "").trim();
    const cpc = cpcRaw ? Number(cpcRaw.replace(/[^\d.,]/g, "").replace(",", ".")) : null;
    const intentRaw = (row["intent"] ?? "").trim().toLowerCase();
    cleaned.push({
      keyword: kw,
      normalized: n,
      volume: vol != null && Number.isFinite(vol) ? Math.round(vol) : null,
      difficulty: diff != null && Number.isFinite(diff) ? Math.round(diff) : null,
      cpc: cpc != null && Number.isFinite(cpc) ? String(cpc) : null,
      dataSource: (row["data_source"] ?? row["source"] ?? "").trim() || null,
      dataDate: (row["data_date"] ?? row["date"] ?? "").trim() || null,
      intent: (intentValues as readonly string[]).includes(intentRaw) ? (intentRaw as Intent) : null,
      targetPage: (row["target_page"] ?? "").trim() || null,
      notes: (row["notes"] ?? "").trim().slice(0, 2000) || null,
      tags: (row["tags"] ?? "").split("|").map((t) => t.trim().slice(0, 50)).filter(Boolean).slice(0, 20),
    });
  }

  const summary = {
    totalRows: result.totalRows,
    validRows: cleaned.length,
    duplicatesInFile: result.rows.length - cleaned.length - invalidRows.length,
    invalidRows: invalidRows.slice(0, 10),
    parseErrors: result.errors,
    sample: cleaned.slice(0, 10),
  };
  if (preview) return ok({ preview: true, ...summary });

  const db = getDb();
  const listRows = await db
    .insert(keywordLists)
    .values({ projectId, name: listName, source: "csv" })
    .returning({ id: keywordLists.id });
  const listId = listRows[0].id;
  const inserted = await db
    .insert(keywordItems)
    .values(cleaned.map((c) => ({ ...c, projectId, listId })))
    .onConflictDoNothing()
    .returning({ id: keywordItems.id });

  return ok({ ...summary, listId, added: inserted.length, skippedExisting: cleaned.length - inserted.length });
});
