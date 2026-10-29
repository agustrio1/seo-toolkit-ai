import * as cheerio from "cheerio";
import { createHash } from "node:crypto";

export interface ParsedPage {
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  metaRobots: string | null;
  h1s: string[];
  h2Count: number;
  h3Count: number;
  internalLinks: string[];
  externalLinks: string[];
  imagesWithoutAlt: number;
  jsonLdTypes: string[];
}

/** Normalisasi URL untuk dedup: protocol+host kecil, hapus fragment, sort query, trim slash. */
export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) {
      u.port = "";
    }
    const params = [...u.searchParams.keys()].sort();
    u.search = params.length ? "?" + params.map((p) => `${p}=${u.searchParams.get(p) ?? ""}`).join("&") : "";
    u.pathname = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, "") || "/" : u.pathname;
    return u.toString();
  } catch {
    return null;
  }
}

export function urlHash(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex").slice(0, 64);
}

/** Parse HTML statis. JavaScript target TIDAK dieksekusi (cheerio scripting off). */
export function parsePageHtml(html: string, pageUrl: string): ParsedPage {
  const $ = cheerio.load(html, { scriptingEnabled: false });
  const base = pageUrl;

  const resolve = (href: string | undefined): string | null => {
    if (!href) return null;
    const h = href.trim();
    if (!h || h.startsWith("#") || h.startsWith("mailto:") || h.startsWith("tel:") || h.startsWith("javascript:")) {
      return null;
    }
    try {
      return normalizeUrl(new URL(h, base).toString());
    } catch {
      return null;
    }
  };

  const hostOf = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return "";
    }
  };
  const startHost = hostOf(base);

  const internal = new Set<string>();
  const external = new Set<string>();
  $("a[href]").each((_, el) => {
    const r = resolve($(el).attr("href"));
    if (!r) return;
    if (hostOf(r) === startHost) internal.add(r);
    else external.add(r);
  });

  const h1s: string[] = [];
  $("h1").each((_, el) => {
    h1s.push($(el).text().trim());
  });

  const jsonLdTypes: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item && typeof item["@type"] === "string") jsonLdTypes.push(item["@type"]);
        if (item && Array.isArray(item["@graph"])) {
          for (const g of item["@graph"]) {
            if (g && typeof g["@type"] === "string") jsonLdTypes.push(g["@type"]);
          }
        }
      }
    } catch {
      jsonLdTypes.push("INVALID_JSON_LD");
    }
  });

  let imagesWithoutAlt = 0;
  $("img").each((_, el) => {
    const alt = ($(el).attr("alt") ?? "").trim();
    if (!alt) imagesWithoutAlt++;
  });

  return {
    title: $("title").first().text().trim() || null,
    metaDescription: $('meta[name="description"]').attr("content")?.trim() ?? null,
    canonical: resolve($('link[rel="canonical"]').attr("href")),
    metaRobots: $('meta[name="robots"]').attr("content")?.trim() ?? null,
    h1s,
    h2Count: $("h2").length,
    h3Count: $("h3").length,
    internalLinks: [...internal],
    externalLinks: [...external],
    imagesWithoutAlt,
    jsonLdTypes,
  };
}

/** Baca robots.txt dan kembalikan path yang di-Disallow untuk user-agent umum. */
export function parseRobotsDisallow(robotsText: string): string[] {
  const disallow: string[] = [];
  let relevant = false;
  for (const line of robotsText.split(/\r?\n/)) {
    const l = line.split("#")[0].trim();
    if (!l) continue;
    const [key, ...rest] = l.split(":");
    const value = rest.join(":").trim();
    const k = key.trim().toLowerCase();
    if (k === "user-agent") {
      const ua = value.toLowerCase();
      relevant = ua === "*";
    } else if (relevant && k === "disallow" && value && value !== "/") {
      disallow.push(value);
    } else if (relevant && k === "disallow" && value === "/") {
      return ["*"];
    }
  }
  return disallow;
}
