import { describe, it, expect } from "vitest";
import {
  analyzeContentDeterministic,
  countExactKeyword,
  densityStatus,
  looksLikeHtml,
  normalizeKeyword,
  wordCount,
} from "@/lib/seo/analyze-text";

describe("normalizeKeyword", () => {
  it("trim, lowercase, rapikan spasi, kutip kurva → lurus", () => {
    expect(normalizeKeyword("  Kopi  Enak’s ")).toBe("kopi enak's");
  });
});

describe("countExactKeyword", () => {
  it("menghitung kemunculan case-insensitive termasuk tumpang tindih urutan", () => {
    expect(countExactKeyword("Jas hujan dan jas hujan lagi", "jas hujan")).toBe(2);
  });
  it("keyword kosong → 0", () => {
    expect(countExactKeyword("apa saja", "   ")).toBe(0);
  });
  it("mencocokkan substring kata (bukan hanya kata utuh) — sesuai desain eksak", () => {
    expect(countExactKeyword("belajar seo penting", "seo")).toBe(1);
  });
});

describe("wordCount", () => {
  it("menghitung kata tanpa spasi berlebih", () => {
    expect(wordCount("satu dua   tiga\nempat")).toBe(4);
    expect(wordCount("   ")).toBe(0);
  });
});

describe("looksLikeHtml", () => {
  it("deteksi tag pembuka/penutup", () => {
    expect(looksLikeHtml("<p>halo</p>")).toBe(true);
    expect(looksLikeHtml("<img src=x>")).toBe(true);
    expect(looksLikeHtml("halo dunia < 3")).toBe(false);
  });
});

describe("densityStatus", () => {
  it("threshold: 0 → low, <0.5 → low, 0.5–4 → adequate, >4 → high", () => {
    expect(densityStatus(0)).toBe("low");
    expect(densityStatus(0.49)).toBe("low");
    expect(densityStatus(0.5)).toBe("adequate");
    expect(densityStatus(4)).toBe("adequate");
    expect(densityStatus(4.01)).toBe("high");
  });
});

describe("analyzeContentDeterministic", () => {
  const html = `
    <html><head><title>x</title></head><body>
    <h1>  </h1>
    <h2>Jas hujan terbaik</h2>
    <h3>Review</h3>
    <p>jas hujan ini jas hujan yang bagus untuk berkendara. Jas Hujan juga awet.</p>
    <img src="a.jpg" alt="foto jas hujan">
    <img src="b.jpg">
    <a href="/kontak">kontak</a>
    </body></html>`;

  it("menghitung struktur HTML: heading, gambar tanpa alt, link", () => {
    const r = analyzeContentDeterministic(html, "jas hujan");
    expect(r.isHtml).toBe(true);
    expect(r.h1Count).toBe(1);
    expect(r.h2Count).toBe(1);
    expect(r.h3Count).toBe(1);
    expect(r.emptyHeadings).toBe(1); // h1 hanya whitespace
    expect(r.imagesTotal).toBe(2);
    expect(r.imagesWithoutAlt).toBe(1);
    expect(r.linksFound).toBe(1);
  });

  it("kepadatan dihitung dari kata plain-text, bukan HTML", () => {
    const r = analyzeContentDeterministic(html, "jas hujan");
    expect(r.exactKeywordOccurrences).toBeGreaterThanOrEqual(3); // "jas hujan" + "Jas Hujan" (case-insensitive)
    expect(r.keywordDensityPercent).toBeGreaterThan(0);
    expect(r.wordCount).toBeLessThan(r.charCount);
  });

  it("konten plain tidak menghasilkan metrik struktur", () => {
    const r = analyzeContentDeterministic("jas hujan bagus", "jas hujan");
    expect(r.isHtml).toBe(false);
    expect(r.h1Count).toBe(0);
    expect(r.imagesTotal).toBe(0);
    expect(r.linksFound).toBe(0);
  });

  it("panjang judul/deskripsi dihitung per code point (aman untuk emoji)", () => {
    const r = analyzeContentDeterministic("isi", "k", {
      title: "😀 jas hujan",
      metaDescription: "halo",
    });
    expect(r.titleLength).toBe(11); // 😀 (1 code point) + spasi + "jas hujan" (9)
    expect(r.metaDescriptionLength).toBe(4);
  });
});
