import { describe, it, expect } from "vitest";
import { buildCsv, CsvError, parseCsvUpload, sanitizeCsvCell } from "@/lib/seo/csv";

describe("parseCsvUpload", () => {
  it("parse header + baris biasa", () => {
    const r = parseCsvUpload("keyword,volume\njas hujan,100\nkopi enak,200\n");
    expect(r.headers).toEqual(["keyword", "volume"]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ keyword: "jas hujan", volume: "100" });
    expect(r.skippedRows).toBe(0);
  });

  it("strip BOM dan spasi pada header", () => {
    const r = parseCsvUpload("\uFEFF keyword , volume\na,1\n");
    expect(r.headers).toEqual(["keyword", "volume"]);
  });

  it("baris kosong tidak muncul di rows; skippedRows = totalRows - rows", () => {
    // Papa (skipEmptyLines: "greedy") membuang baris kosong/whitespace lebih dulu.
    const r = parseCsvUpload("keyword,volume\na,1\n\n\nb,2\n\n");
    expect(r.rows).toHaveLength(2);
    expect(r.rows.map((x) => x.keyword)).toEqual(["a", "b"]);
    expect(r.skippedRows).toBe(r.totalRows - r.rows.length);
  });

  it("tanpa header → CsvError CSV_NO_HEADER", () => {
    expect(() => parseCsvUpload("")).toThrowError(
      expect.objectContaining({ code: "CSV_NO_HEADER" }) as unknown as Error,
    );
    try {
      parseCsvUpload("");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CsvError);
      expect((e as CsvError).code).toBe("CSV_NO_HEADER");
    }
  });

  it("kolom wajib hilang → CSV_MISSING_COLUMNS dengan daftar kolom", () => {
    try {
      parseCsvUpload("keyword\na\n", ["keyword", "volume"]);
      expect.unreachable();
    } catch (e) {
      expect((e as CsvError).code).toBe("CSV_MISSING_COLUMNS");
      expect((e as CsvError).publicMessage).toContain("volume");
    }
  });

  it("file terlalu besar → CSV_TOO_LARGE", () => {
    const big = "keyword\n" + "x".repeat(3 * 1024 * 1024);
    expect(() => parseCsvUpload(big)).toThrowError(
      expect.objectContaining({ code: "CSV_TOO_LARGE" }) as unknown as Error,
    );
  });

  it("kelebihan batas baris → CSV_TOO_MANY_ROWS", () => {
    const lines = ["keyword"];
    for (let i = 0; i < 5001; i++) lines.push(`k${i}`);
    expect(() => parseCsvUpload(lines.join("\n"))).toThrowError(
      expect.objectContaining({ code: "CSV_TOO_MANY_ROWS" }) as unknown as Error,
    );
  });
});

describe("sanitizeCsvCell (formula injection)", () => {
  it("prefix ' untuk sel yang diawali = + - @ tab/CR", () => {
    expect(sanitizeCsvCell("=HYPERLINK(\"http://evil\")")).toMatch(/^'/);
    expect(sanitizeCsvCell("+12345")).toMatch(/^'/);
    expect(sanitizeCsvCell("-4+2")).toMatch(/^'/);
    expect(sanitizeCsvCell("@SUM(A1)")).toMatch(/^'/);
    expect(sanitizeCsvCell("\ttab")).toMatch(/^'/);
    expect(sanitizeCsvCell("\rcr")).toMatch(/^'/);
  });

  it("sel biasa tidak diubah", () => {
    expect(sanitizeCsvCell("jas hujan")).toBe("jas hujan");
    expect(sanitizeCsvCell(null)).toBe("");
    expect(sanitizeCsvCell(42)).toBe("42");
  });
});

describe("buildCsv", () => {
  const columns = [
    { key: "keyword", header: "Keyword" },
    { key: "note", header: "Catatan" },
  ];

  it("menambahkan BOM tepat satu kali dan header di baris pertama", () => {
    const csv = buildCsv(columns, [{ keyword: "a", note: "b" }]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.slice(1).split("\r\n")[0]).toBe("Keyword,Catatan");
  });

  it("mendscape nilai berisi koma/quote sesuai RFC", () => {
    const csv = buildCsv(columns, [{ keyword: "kopi, enak", note: 'dia "bilang"' }]);
    expect(csv).toContain('"kopi, enak"');
    expect(csv).toContain('"dia ""bilang"""');
  });

  it("menerapkan sanitize pada setiap sel", () => {
    const csv = buildCsv(columns, [{ keyword: "=cmd", note: null }]);
    expect(csv).toContain("'=cmd");
  });
});
