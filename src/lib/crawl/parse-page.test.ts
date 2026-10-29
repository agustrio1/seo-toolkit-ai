import { describe, it, expect } from "vitest";
import { normalizeUrl, parsePageHtml, parseRobotsDisallow, urlHash } from "@/lib/crawl/parse-page";
import { isDisallowed } from "@/lib/crawl/crawler";

describe("normalizeUrl", () => {
  it("menghapus fragment, menyortir query, lowercases host", () => {
    expect(normalizeUrl("HTTPS://Example.COM/Path/?b=2&a=1#frag")).toBe(
      "https://example.com/Path?a=1&b=2",
    );
  });
  it("menghapus port default & slash trailing", () => {
    expect(normalizeUrl("https://example.com:443/blog/")).toBe("https://example.com/blog");
    expect(normalizeUrl("http://example.com:80/")).toBe("http://example.com/");
  });
  it("non-http/https dan URL rusak → null", () => {
    expect(normalizeUrl("ftp://example.com/x")).toBeNull();
    expect(normalizeUrl("bukan-url")).toBeNull();
  });
});

describe("urlHash", () => {
  it("stabil untuk input sama, berbeda untuk input berbeda", () => {
    expect(urlHash("https://a.com/x")).toBe(urlHash("https://a.com/x"));
    expect(urlHash("https://a.com/x")).not.toBe(urlHash("https://a.com/y"));
    expect(urlHash("https://a.com/x")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("parsePageHtml", () => {
  const html = `
    <html><head>
      <title>  Judul Halaman  </title>
      <meta name="description" content=" Deskripsi halaman ">
      <link rel="canonical" href="https://example.com/page">
      <meta name="robots" content="noindex,follow">
      <script type="application/ld+json">{"@type":"Article"}</script>
      <script type="application/ld+json">{"@graph":[{"@type":"BreadcrumbList"}]}</script>
      <script>document.write("JS TIDAK BOLEH DIEKSEKUSI")</script>
    </head><body>
      <h1>H1 Pertama</h1><h1>H1 Kedua</h1>
      <h2>a</h2><h2>b</h2><h3>c</h3>
      <a href="/internal1">i1</a>
      <a href="https://www.example.com/internal1">dup (www + fragment)</a>
      <a href="https://other.com/x">eksternal</a>
      <a href="mailto:x@y.z">abaikan</a>
      <a href="#section">abaikan</a>
      <img src="a.jpg" alt="ok"><img src="b.jpg"><img src="c.jpg" alt="">
    </body></html>`;
  const page = parsePageHtml(html, "https://example.com/page");

  it("ekstrak title/description/canonical/robots dengan trim", () => {
    expect(page.title).toBe("Judul Halaman");
    expect(page.metaDescription).toBe("Deskripsi halaman");
    expect(page.canonical).toBe("https://example.com/page");
    expect(page.metaRobots).toBe("noindex,follow");
  });

  it("heading: h1 teks lengkap, h2/h3 dihitung", () => {
    expect(page.h1s).toEqual(["H1 Pertama", "H1 Kedua"]);
    expect(page.h2Count).toBe(2);
    expect(page.h3Count).toBe(1);
  });

  it("pemisahan link internal/eksternal; www tetap internal tapi URL-nya beda", () => {
    // hostOf mengabaikan www → keduanya internal. normalizeUrl mempertahankan www,
    // sehingga kedua URL tetap (dedup hanya untuk URL identik).
    expect(page.internalLinks).toContain("https://example.com/internal1");
    expect(page.internalLinks).toContain("https://www.example.com/internal1");
    expect(page.externalLinks).toEqual(["https://other.com/x"]);
  });

  it("gambar tanpa alt non-kosong dihitung (alt=\"\" dianggap disengaja tapi tetap tanpa teks)", () => {
    // Implementasi: alt kosong/absen sama-sama dihitung tanpa alt.
    expect(page.imagesWithoutAlt).toBe(2);
  });

  it("jsonLd termasuk @graph; script biasa tidak dieksekusi", () => {
    expect(page.jsonLdTypes).toContain("Article");
    expect(page.jsonLdTypes).toContain("BreadcrumbList");
    expect(page.title).not.toContain("JS");
  });

  it("JSON-LD rusak ditandai, bukan melempar", () => {
    const p = parsePageHtml('<script type="application/ld+json">{rusak</script>', "https://example.com/");
    expect(p.jsonLdTypes).toContain("INVALID_JSON_LD");
  });
});

describe("parseRobotsDisallow + isDisallowed", () => {
  it("mengambil Disallow untuk user-agent * saja", () => {
    const robots = `User-agent: *\nDisallow: /admin\nDisallow: /private/\n\nUser-agent: Googlebot\nDisallow: /untuk-google-only\n`;
    expect(parseRobotsDisallow(robots)).toEqual(["/admin", "/private/"]);
  });

  it("Disallow: / berarti semua dilarang → sentinel *", () => {
    expect(parseRobotsDisallow("User-agent: *\nDisallow: /\n")).toEqual(["*"]);
    expect(isDisallowed("/apa-pun", ["*"])).toBe(true);
  });

  it("isDisallowed mencocokkan prefiks", () => {
    const d = ["/admin", "/private/"];
    expect(isDisallowed("/admin/panel", d)).toBe(true);
    expect(isDisallowed("/private/x", d)).toBe(true);
    expect(isDisallowed("/publik", d)).toBe(false);
    expect(isDisallowed("/administrator", d)).toBe(true); // prefiks murni, sesuai dokumentasi
  });

  it("komentar dan baris kosong diabaikan", () => {
    expect(parseRobotsDisallow("# komentar\nUser-agent: * # x\nDisallow: /a # y")).toEqual(["/a"]);
  });
});
