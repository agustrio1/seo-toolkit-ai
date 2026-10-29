import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bulkJobs, bulkJobItems } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { assertProjectOwnership } from "@/lib/auth/ownership";
import { ok, fail, route, readJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Batas item per job dirancang ramah kuota tier gratis (lihat BAGIAN S). */
const MAX_ITEMS_PER_JOB = 30;

const createSchema = z.object({
  projectId: z.string().uuid(),
  type: z.literal("meta_generation"),
  idempotencyKey: z.string().max(100).optional(),
  config: z.object({
    audience: z.string().max(300).optional(),
    businessName: z.string().max(200).optional(),
    style: z.string().max(100).optional(),
  }),
  items: z
    .array(z.object({ keyword: z.string().min(2).max(300), pageUrl: z.string().max(500).optional() }))
    .min(1)
    .max(MAX_ITEMS_PER_JOB),
});

export const GET = route(async () => {
  const user = await requireSessionUser();
  const db = getDb();
  const rows = await db
    .select()
    .from(bulkJobs)
    .where(eq(bulkJobs.userId, user.id))
    .orderBy(desc(bulkJobs.createdAt))
    .limit(50);
  return ok(rows);
});

export const POST = route(async (req) => {
  const user = await requireSessionUser();
  const parsed = createSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return fail("INVALID_INPUT", `Job dibuat maksimal ${MAX_ITEMS_PER_JOB} item per request (hemat kuota AI tier gratis).`);
  }
  const { projectId, type, items, config, idempotencyKey } = parsed.data;
  await assertProjectOwnership(projectId, user.id);
  const db = getDb();

  // Idempotency: request ulang dengan key sama tidak membuat job duplikat.
  if (idempotencyKey) {
    const existing = await db
      .select()
      .from(bulkJobs)
      .where(eq(bulkJobs.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing.length > 0 && existing[0].userId === user.id) {
      return ok({ job: existing[0], reused: true });
    }
  }

  const jobRows = await db
    .insert(bulkJobs)
    .values({
      userId: user.id,
      projectId,
      type,
      status: "queued",
      totalItems: items.length,
      idempotencyKey,
    })
    .returning();
  const job = jobRows[0];
  await db.insert(bulkJobItems).values(
    items.map((it, i) => ({
      jobId: job.id,
      ordinal: i,
      payload: { ...it, config },
      status: "pending" as const,
    })),
  );
  return ok({ job }, { status: 201 });
});
