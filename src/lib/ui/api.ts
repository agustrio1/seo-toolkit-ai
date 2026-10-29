"use client";

/** Error API dengan kode + status HTTP untuk penanganan UI. */
export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = "UNKNOWN", status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Fetch JSON ke /api dengan pembongkaran envelope { success, data } / { success:false, message }.
 * Gagal lempar ApiError dengan pesan server yang sudah disanitasi (tidak pernah menelan pesan 429 kuota).
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  let json: { success?: boolean; data?: T; message?: string; error?: string };
  try {
    json = await res.json();
  } catch {
    throw new ApiError(`Respons server tidak valid (HTTP ${res.status}).`, "BAD_RESPONSE", res.status);
  }
  if (!res.ok || json.success === false) {
    throw new ApiError(json.message || `Permintaan gagal (HTTP ${res.status}).`, json.error || "UNKNOWN", res.status);
  }
  return json.data as T;
}

/** Versi yang juga mengembalikan meta pagination (envelope paginated()). */
export async function apiFetchPaged<T>(path: string): Promise<{ data: T; pagination: { page: number; perPage: number; total: number } }> {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" } });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.success === false) {
    throw new ApiError(json?.message || `Permintaan gagal (HTTP ${res.status}).`, json?.error || "UNKNOWN", res.status);
  }
  return { data: json.data as T, pagination: json.pagination };
}

/** Unduh file (CSV export) dari endpoint yang mengembalikan blob. */
export async function downloadFile(path: string, filename: string) {
  const res = await fetch(path);
  if (!res.ok) {
    let msg = `Gagal mengunduh (HTTP ${res.status}).`;
    try {
      const j = await res.json();
      if (j?.message) msg = j.message;
    } catch {
      /* abaikan */
    }
    throw new ApiError(msg, "DOWNLOAD_FAILED", res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Ringkas error menjadi pesan yang aman ditampilkan. */
export function errMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Terjadi kesalahan tidak dikenal.";
}
