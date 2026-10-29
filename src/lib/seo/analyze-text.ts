/** Pemeriksaan SEO deterministik berbasis kode, tanpa AI. */

export interface DeterministicContentReport {
  wordCount: number;
  charCount: number;
  exactKeywordOccurrences: number;
  keywordDensityPercent: number;
  h1Count: number;
  h2Count: number;
  h3Count: number;
  emptyHeadings: number;
  titleLength?: number;
  metaDescriptionLength?: number;
  imagesTotal: number;
  imagesWithoutAlt: number;
  linksFound: number;
  isHtml: boolean;
}

export function normalizeKeyword(k: string): string {
  return k.trim().toLowerCase().replace(/\s+/g, " ").replace(/[’]/g, "'");
}

export function countExactKeyword(text: string, keyword: string): number {
  const hay = text.toLowerCase();
  const needle = normalizeKeyword(keyword);
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = hay.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/** Deteksi sederhana apakah konten berbentuk HTML. */
export function looksLikeHtml(text: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(text);
}

function stripHtml(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
}

/** Analisis konten. Hanya membaca string; tidak ada eksekusi HTML/JS. */
export function analyzeContentDeterministic(
  content: string,
  keyword: string,
  opts?: { title?: string; metaDescription?: string },
): DeterministicContentReport {
  const isHtml = looksLikeHtml(content);
  const plain = isHtml ? stripHtml(content) : content;
  const words = wordCount(plain);
  const occurrences = countExactKeyword(plain, keyword);
  const density = words > 0 ? (occurrences * normalizeKeyword(keyword).split(" ").length * 100) / words : 0;

  let h1 = 0,
    h2 = 0,
    h3 = 0,
    empty = 0,
    images = 0,
    imagesNoAlt = 0,
    links = 0;

  if (isHtml) {
    h1 = (content.match(/<h1[\s>]/gi) ?? []).length;
    h2 = (content.match(/<h2[\s>]/gi) ?? []).length;
    h3 = (content.match(/<h3[\s>]/gi) ?? []).length;
    // Heading kosong: tag dengan isi hanya whitespace.
    const headingMatches = content.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi);
    for (const m of headingMatches) {
      if (!m[2] || m[2].replace(/<[^>]+>/g, "").trim() === "") empty++;
    }
    const imgTags = content.match(/<img\b[^>]*>/gi) ?? [];
    images = imgTags.length;
    imagesNoAlt = imgTags.filter((t) => !/\balt\s*=\s*"[^"]+"/i.test(t) && !/\balt\s*=\s*'[^']+'/i.test(t)).length;
    links = (content.match(/<a\b[^>]*href/gi) ?? []).length;
  }

  return {
    wordCount: words,
    charCount: content.length,
    exactKeywordOccurrences: occurrences,
    keywordDensityPercent: Math.round(density * 100) / 100,
    h1Count: h1,
    h2Count: h2,
    h3Count: h3,
    emptyHeadings: empty,
    titleLength: opts?.title ? [...opts.title].length : undefined,
    metaDescriptionLength: opts?.metaDescription ? [...opts.metaDescription].length : undefined,
    imagesTotal: images,
    imagesWithoutAlt: imagesNoAlt,
    linksFound: links,
    isHtml,
  };
}

export function densityStatus(density: number): "low" | "adequate" | "high" | "unknown" {
  if (density <= 0) return "low";
  if (density > 4) return "high";
  if (density >= 0.5) return "adequate";
  return "low";
}
