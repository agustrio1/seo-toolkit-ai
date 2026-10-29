import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/sessions";
import { AiQuotaError, AiError } from "@/lib/gemini/client";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, data }, init);
}

export function paginated<T>(data: T, meta: Record<string, unknown>) {
  return NextResponse.json({ success: true, data, pagination: meta });
}

export function fail(error: string, message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error, message, ...extra }, { status });
}

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

/**
 * Membungkus handler dengan pemetaan error konsisten.
 * Tidak pernah membocorkan stack trace / secret ke client.
 */
export function route(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof AuthError) {
        const status = e.code === "UNAUTHENTICATED" ? 401 : 403;
        return fail(e.code, "Sesi tidak valid atau Anda tidak berhak mengakses data ini.", status);
      }
      if (e instanceof AiQuotaError) {
        return fail(
          "AI_QUOTA_LIMITED",
          "Kuota harian Gemini (tier gratis) sedang habis atau terlalu banyak request. Coba lagi beberapa menit/jam ke depan — kuota harian reset tengah malam waktu Pacific.",
          429,
        );
      }
      if (e instanceof AiError) {
        return fail(e.code, e.publicMessage, 502);
      }
      console.error("UNHANDLED_ROUTE_ERROR", e instanceof Error ? e.message : e);
      return fail("INTERNAL_ERROR", "Terjadi kesalahan pada server. Coba lagi.", 500);
    }
  };
}

/** Parse JSON body dengan batas ukuran sederhana. */
export async function readJson(req: Request, maxBytes = 1_000_000): Promise<unknown> {
  const raw = await req.text();
  if (raw.length > maxBytes) {
    throw new BodyTooLargeError();
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw new InvalidBodyError();
  }
}

export class BodyTooLargeError extends Error {}
export class InvalidBodyError extends Error {}
