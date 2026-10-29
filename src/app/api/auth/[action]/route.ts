import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";
import { createSession, destroySession } from "@/lib/auth/sessions";
import { ok, fail, route, readJson } from "@/lib/api/response";

export const runtime = "nodejs";

const emailSchema = z.string().email().max(320).transform((s) => s.toLowerCase().trim());
const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: emailSchema,
  password: z.string().min(10).max(200),
});

const rate = new Map<string, { count: number; windowStart: number }>();
/** Pembatasan sederhana percobaan login per IP (batas memori per instance, bukan global). */
function tooMany(key: string): boolean {
  const now = Date.now();
  const entry = rate.get(key);
  if (!entry || now - entry.windowStart > 60_000) {
    rate.set(key, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  return entry.count > 10;
}

export const POST = route(async (req, ctx) => {
  const { action } = await ctx.params;
  if (action !== "login" && action !== "register") {
    return fail("NOT_FOUND", "Endpoint tidak ditemukan.", 404);
  }
  const isRegister = action === "register";
  const body = await readJson(req);

  if (isRegister) {
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) return fail("INVALID_INPUT", "Nama, email, atau password tidak valid (password minimal 10 karakter).");
    const db = getDb();
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
    if (existing.length > 0) return fail("EMAIL_TAKEN", "Email sudah terdaftar.", 409);
    const passwordHash = await hashPassword(parsed.data.password);
    const inserted = await db
      .insert(users)
      .values({ email: parsed.data.email, name: parsed.data.name, passwordHash })
      .returning({ id: users.id });
    await createSession(inserted[0].id);
    return ok({ registered: true }, { status: 201 });
  }

  const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return fail("INVALID_INPUT", "Email atau password tidak valid.");
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (tooMany(ip)) return fail("RATE_LIMITED", "Terlalu banyak percobaan. Tunggu satu menit.", 429);

  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (rows.length === 0 || !(await verifyPassword(parsed.data.password, rows[0].passwordHash))) {
    return fail("INVALID_CREDENTIALS", "Email atau password salah.", 401);
  }
  await createSession(rows[0].id);
  return ok({ loggedIn: true });
});

export const DELETE = route(async () => {
  await destroySession();
  return NextResponse.json({ success: true, data: { loggedOut: true } });
});
