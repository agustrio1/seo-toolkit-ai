import Papa from "papaparse";

export const CSV_MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
export const CSV_MAX_ROWS = 5000;

export interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
  errors: string[];
  totalRows: number;
  skippedRows: number;
}

/**
 * Parse CSV untuk import. Validasi ukuran, header, dan baris.
 * Tidak memercayai ekstensi file — konten benar-benar diparse.
 */
export function parseCsvUpload(text: string, expectedHeaders?: string[]): CsvParseResult {
  if (text.length > CSV_MAX_FILE_BYTES) {
    throw new CsvError("CSV_TOO_LARGE", `Ukuran CSV melebihi batas ${CSV_MAX_FILE_BYTES / 1024} KB.`);
  }
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });

  const headers = (parsed.meta.fields ?? []).filter((h) => h.length > 0);
  if (headers.length === 0) {
    throw new CsvError("CSV_NO_HEADER", "CSV harus memiliki baris header.");
  }
  if (expectedHeaders) {
    const missing = expectedHeaders.filter((e) => !headers.includes(e));
    if (missing.length > 0) {
      throw new CsvError("CSV_MISSING_COLUMNS", `Kolom wajib tidak ditemukan: ${missing.join(", ")}.`);
    }
  }
  if (parsed.data.length > CSV_MAX_ROWS) {
    throw new CsvError("CSV_TOO_MANY_ROWS", `Jumlah baris melebihi batas ${CSV_MAX_ROWS}.`);
  }
  const rows = parsed.data.filter((r) => Object.values(r).some((v) => (v ?? "").trim() !== ""));
  const errors = parsed.errors
    .slice(0, 20)
    .map((e) => `Baris ${e.row ?? "?"}: ${e.message}`);
  return {
    headers,
    rows,
    errors,
    totalRows: parsed.data.length,
    skippedRows: parsed.data.length - rows.length,
  };
}

export class CsvError extends Error {
  code: string;
  publicMessage: string;
  constructor(code: string, publicMessage: string) {
    super(code);
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

/**
 * Netralkan CSV formula injection: sel yang diawali = + - @ atau tab/CR
 * diberi prefix ' agar tidak dieksekusi spreadsheet.
 */
export function sanitizeCsvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) return `'${s}`;
  return s;
}

export interface CsvExportColumn {
  key: string;
  header: string;
}

/**
 * Bangun CSV ekspor: urutan kolom stabil, escaping ditangani PapaParse,
 * BOM ditambahkan agar Excel mempertahankan Unicode.
 */
export function buildCsv(columns: CsvExportColumn[], rows: Record<string, unknown>[]): string {
  const data = rows.map((r) => {
    const out: Record<string, string> = {};
    for (const c of columns) out[c.header] = sanitizeCsvCell(r[c.key]);
    return out;
  });
  const csv = Papa.unparse(
    { fields: columns.map((c) => c.header), data },
    { quotes: false },
  );
  return "\uFEFF" + csv;
}
