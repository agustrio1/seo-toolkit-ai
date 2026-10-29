import { and, between, count, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { usageRecords } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { ok, route } from "@/lib/api/response";
import { pacificDayStartUtc } from "@/lib/gemini/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const user = await requireSessionUser();
  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? "7"), 1), 90);
  const since = new Date(Date.now() - days * 86_400_000);
  const db = getDb();

  const [byTool, byStatus, recent, daily] = await Promise.all([
    db
      .select({
        tool: usageRecords.tool,
        requests: count(),
        tokensIn: sql<number>`coalesce(sum(${usageRecords.tokensIn}), 0)::int`,
        tokensOut: sql<number>`coalesce(sum(${usageRecords.tokensOut}), 0)::int`,
      })
      .from(usageRecords)
      .where(and(eq(usageRecords.userId, user.id), gte(usageRecords.createdAt, since)))
      .groupBy(usageRecords.tool),
    db
      .select({ status: usageRecords.status, n: count() })
      .from(usageRecords)
      .where(and(eq(usageRecords.userId, user.id), gte(usageRecords.createdAt, since)))
      .groupBy(usageRecords.status),
    db
      .select()
      .from(usageRecords)
      .where(eq(usageRecords.userId, user.id))
      .orderBy(desc(usageRecords.createdAt))
      .limit(50),
    db
      .select({
        day: sql<string>`to_char(${usageRecords.createdAt}, 'YYYY-MM-DD')`,
        n: count(),
      })
      .from(usageRecords)
      .where(and(eq(usageRecords.userId, user.id), between(usageRecords.createdAt, since, new Date())))
      .groupBy(sql`to_char(${usageRecords.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`1`),
  ]);

  // Perkiraan biaya TIDAK dihitung karena tier gratis tidak mengembalikan
  // informasi harga dan tarif dapat berubah; angka tarif harus diverifikasi dulu.
  const todayUsed = await db
    .select({ n: count() })
    .from(usageRecords)
    .where(gte(usageRecords.createdAt, pacificDayStartUtc()));

  const cap = Number(process.env.GEMINI_DAILY_REQUEST_CAP ?? "150");
  return ok({
    periodDays: days,
    byTool,
    byStatus,
    daily,
    recent,
    globalDaily: {
      used: Number(todayUsed[0]?.n ?? 0),
      cap,
      note: "Batas harian bersifat GLOBAL untuk seluruh pengguna aplikasi karena satu API key tier gratis. Reset tengah malam waktu Pacific. Estimasi biaya tidak ditampilkan karena tarif tier gratis tidak dikembalikan API.",
    },
  });
});
