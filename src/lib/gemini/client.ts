import { sql, and, gte } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { usageRecords } from "@/lib/db/schema";
import { resolveModel, type GeminiModel } from "./models";

const API_VERSION = "v1beta";

export class AiError extends Error {
  code: string;
  publicMessage: string;
  constructor(code: string, publicMessage: string) {
    super(code);
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

/** Kuota tier gratis tercapai (cap lokal atau 429 dari Google). */
export class AiQuotaError extends Error {
  constructor() {
    super("AI_QUOTA_LIMITED");
  }
}

/** Skema JSON untuk generationConfig.responseSchema (subset OpenAPI). */
export type GeminiSchema = Record<string, unknown>;

export interface GenerateOptions<T = unknown> {
  tool: string;
  userId: string;
  projectId?: string;
  systemInstruction?: string;
  prompt: string;
  responseSchema: GeminiSchema;
  zodSchema: z.ZodType<T>;
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface GenerateResult<T> {
  data: T;
  model: GeminiModel;
  tokensIn?: number;
  tokensOut?: number;
}

function caps() {
  return {
    daily: Number(process.env.GEMINI_DAILY_REQUEST_CAP ?? "150"),
    perMinute: Number(process.env.GEMINI_PER_MINUTE_CAP ?? "4"),
  };
}

/** Batas RPD tier gratis reset tengah malam waktu Pacific. Hitung awal hari Pacific dalam UTC. */
export function pacificDayStartUtc(now = new Date()): Date {
  const pacificNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const offsetMs = Math.round((pacificNow.getTime() - now.getTime()) / 60000) * 60000;
  const midnightPacific = new Date(
    Date.UTC(pacificNow.getFullYear(), pacificNow.getMonth(), pacificNow.getDate()),
  );
  return new Date(midnightPacific.getTime() - offsetMs);
}

/**
 * Gerbang kuota GLOBAL: satu API key tier gratis dipakai bersama seluruh user aplikasi,
 * sehingga batas dihitung dari seluruh usage_records periode ini, bukan per user.
 */
async function assertWithinBudget(): Promise<void> {
  const { daily, perMinute } = caps();
  const db = getDb();
  const since = pacificDayStartUtc();
  const [dayRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(usageRecords)
    .where(gte(usageRecords.createdAt, since));
  if (Number(dayRow?.n ?? 0) >= daily) throw new AiQuotaError();

  const [minRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(usageRecords)
    .where(
      and(
        gte(usageRecords.createdAt, new Date(Date.now() - 60_000)),
        sql`${usageRecords.status} in ('ok', 'rate_limited')`,
      ),
    );
  if (Number(minRow?.n ?? 0) >= perMinute) throw new AiQuotaError();
}

async function recordUsage(opts: {
  userId: string;
  projectId?: string;
  tool: string;
  model: string;
  status: "ok" | "error" | "rate_limited";
  tokensIn?: number;
  tokensOut?: number;
}) {
  try {
    const db = getDb();
    await db.insert(usageRecords).values({
      userId: opts.userId,
      projectId: opts.projectId,
      tool: opts.tool,
      model: opts.model,
      status: opts.status,
      tokensIn: opts.tokensIn,
      tokensOut: opts.tokensOut,
    });
  } catch (e) {
    // Pencatatan usage tidak boleh menggagalkan analisis; log pesan saja (tanpa secret).
    console.error("USAGE_RECORD_FAILED", e instanceof Error ? e.message : e);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string; status?: string };
}

function extractText(json: GeminiResponse): string {
  return (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}

/**
 * Satu panggilan JSON-terstruktur ke Gemini API via fetch server-side.
 * - responseMimeType application/json + responseSchema (structured output).
 * - Output model dianggap input tidak tepercaya: selalu divalidasi zod.
 * - Retry terbatas (maks 2) dengan backoff untuk 429 / 5xx / timeout.
 */
export async function generateJson<T>(opts: GenerateOptions<T>): Promise<GenerateResult<T>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AiError(
      "AI_NOT_CONFIGURED",
      "Gemini API belum dikonfigurasi. Isi GEMINI_API_KEY pada environment server.",
    );
  }
  const model = resolveModel(opts.model);
  await assertWithinBudget();

  // API key hanya ada di URL server-side; jangan pernah dicetak.
  const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${model}:generateContent?key=${apiKey}`;
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: opts.responseSchema,
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxOutputTokens ?? 4096,
    },
  };
  if (opts.systemInstruction) {
    body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
  }

  const maxRetries = 2;
  let lastError = "AI_UPSTREAM";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await sleep(2000 * 2 ** (attempt - 1) + Math.random() * 500);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
    } catch {
      lastError = "AI_TIMEOUT";
      continue;
    }

    if (res.status === 429) {
      await recordUsage({ ...base(opts), model, status: "rate_limited" });
      lastError = "AI_RATE_LIMITED";
      continue;
    }
    if (res.status >= 500) {
      lastError = "AI_UPSTREAM";
      continue;
    }
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as GeminiResponse;
      await recordUsage({ ...base(opts), model, status: "error" });
      // Status API Google: 400 biasanya kuota/konfigurasi salah, 403 izin key.
      throw new AiError(
        "AI_REQUEST_FAILED",
        `Permintaan AI gagal (${errBody.error?.status ?? res.status}). Periksa konfigurasi GEMINI_API_KEY/model.`,
      );
    }

    const json = (await res.json()) as GeminiResponse;
    const text = extractText(json);
    const tokensIn = json.usageMetadata?.promptTokenCount;
    const tokensOut = json.usageMetadata?.candidatesTokenCount;

    if (!text.trim()) {
      await recordUsage({ ...base(opts), model, status: "error", tokensIn, tokensOut });
      throw new AiError("AI_EMPTY_RESPONSE", "Respons AI kosong. Silakan coba lagi.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      await recordUsage({ ...base(opts), model, status: "error", tokensIn, tokensOut });
      throw new AiError("AI_INVALID_JSON", "Respons AI tidak sesuai format JSON yang diminta.");
    }

    const validated = opts.zodSchema.safeParse(parsed);
    if (!validated.success) {
      await recordUsage({ ...base(opts), model, status: "error", tokensIn, tokensOut });
      throw new AiError("AI_SCHEMA_MISMATCH", "Output AI tidak memenuhi skema yang ditentukan.");
    }

    await recordUsage({ ...base(opts), model, status: "ok", tokensIn, tokensOut });
    return { data: validated.data, model, tokensIn, tokensOut };
  }

  if (lastError === "AI_RATE_LIMITED") throw new AiQuotaError();
  await recordUsage({ ...base(opts), model, status: "error" });
  throw new AiError(lastError, "Layanan AI sedang tidak tersedia. Coba lagi sebentar.");
}

function base(opts: { userId: string; projectId?: string; tool: string }) {
  return { userId: opts.userId, projectId: opts.projectId, tool: opts.tool };
}

/**
 * Retry terkontrol satu kali jika output tidak sesuai skema,
 * dengan petunjuk format yang lebih tegas. Semua error lain diteruskan.
 */
export async function generateJsonWithRepair<T>(
  opts: GenerateOptions<T>,
): Promise<GenerateResult<T>> {
  try {
    return await generateJson<T>(opts);
  } catch (e) {
    if (e instanceof AiError && e.code === "AI_SCHEMA_MISMATCH") {
      return generateJson<T>({
        ...opts,
        prompt:
          opts.prompt +
          "\n\nPENTING: Keluarkan HANYA satu objek JSON valid sesuai skema. Tanpa teks lain, tanpa markdown code fence.",
      });
    }
    throw e;
  }
}
