import { requireSessionUser } from "@/lib/auth/sessions";
import { ok, fail, route } from "@/lib/api/response";
import { generateJson, AiError, AiQuotaError } from "@/lib/gemini/client";
import { buildKeywordIntelPrompt } from "@/lib/gemini/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Saran nyata dari Google Autocomplete (endpoint publik, tanpa key).
 * Host tetap — tidak ada input user di hostname, jadi tidak perlu resolve SSRF.
 */
async function fetchAutocomplete(q: string): Promise<string[]> {
  const url =
    "https://suggestqueries.google.com/complete/search?client=firefox&hl=id&gl=id&q=" +
    encodeURIComponent(q);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return [];
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json) || !Array.isArray(json[1])) return [];
    return (json[1] as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 20);
  } catch {
    return [];
  }
}

/**
 * Riset keyword cepat: saran Google Autocomplete (data nyata) + estimasi
 * persaingan/difficulty oleh AI (berlabel estimasi — bukan angka Ahrefs/Semrush).
 * AI memakai kuota Gemini; bila kuota habis, saran nyata tetap dikembalikan.
 */
export const GET = route(async (req) => {
  const user = await requireSessionUser();
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 100) {
    return fail("INVALID_INPUT", "Ketik kata kunci 2–100 karakter.");
  }

  const suggestions = await fetchAutocomplete(q);

  let ai = null;
  let aiError: string | null = null;
  try {
    const r = await generateJson({
      tool: "keyword_intel",
      ...buildKeywordIntelPrompt({ userId: user.id, keyword: q, suggestions }),
    });
    ai = r.data;
  } catch (e) {
    if (e instanceof AiQuotaError) {
      aiError = "Kuota AI harian/per-menit habis — saran autocomplete (gratis) tetap tampil. Coba lagi beberapa saat.";
    } else if (e instanceof AiError) {
      aiError = "Analisis AI gagal — tidak ada data yang dikarang. Coba lagi.";
    } else {
      throw e;
    }
  }

  return ok({
    query: q,
    suggestions,
    ai,
    aiError,
    disclaimer:
      "Angka difficulty & persaingan adalah ESTIMASI AI berdasar pengetahuan umum + sinyal autocomplete — bukan metrik terukur Ahrefs/Semrush/Keyword Planner. Volume pencarian tidak ditampilkan karena kami tidak punya sumber datanya; untuk data nyata milik Anda sendiri gunakan halaman Search Console.",
  });
});
