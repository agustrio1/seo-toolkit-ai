/**
 * Allowlist model Gemini yang tersedia & aman untuk tier gratis.
 * Daftar final harus diverifikasi di https://ai.google.dev/gemini-api/docs/models
 * dan AI Studio sebelum menambah model baru.
 */
export const GEMINI_MODEL_ALLOWLIST = [
  "gemini-3.1-flash",
  "gemini-3.1-flash-lite",
] as const;

export type GeminiModel = (typeof GEMINI_MODEL_ALLOWLIST)[number];

export function resolveModel(requested?: string): GeminiModel {
  const fromEnv = process.env.GEMINI_MODEL;
  const candidate = requested ?? fromEnv ?? "gemini-2.5-flash";
  if ((GEMINI_MODEL_ALLOWLIST as readonly string[]).includes(candidate)) {
    return candidate as GeminiModel;
  }
  // Nilai di luar allowlist tidak pernah dipakai; fallback ke default murah.
  return "gemini-3.1-flash";
}
