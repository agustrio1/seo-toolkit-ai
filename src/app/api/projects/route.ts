import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { ok, fail, route, readJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(2).max(200),
  domain: z
    .string()
    .min(3)
    .max(300)
    .transform((s) => {
      try {
        return new URL(s.startsWith("http") ? s : `https://${s}`).hostname.toLowerCase();
      } catch {
        return s.toLowerCase();
      }
    }),
  description: z.string().max(2000).optional(),
});

export const GET = route(async () => {
  const user = await requireSessionUser();
  const db = getDb();
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, user.id), eq(projects.archived, false)))
    .orderBy(desc(projects.createdAt))
    .limit(100);
  return ok(rows);
});

export const POST = route(async (req) => {
  const user = await requireSessionUser();
  const parsed = createSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail("INVALID_INPUT", "Nama atau domain tidak valid.");
  const db = getDb();
  const rows = await db
    .insert(projects)
    .values({
      userId: user.id,
      name: parsed.data.name,
      domain: parsed.data.domain,
      description: parsed.data.description,
    })
    .returning();
  return ok(rows[0], { status: 201 });
});
