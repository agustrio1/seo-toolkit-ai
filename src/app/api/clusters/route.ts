import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { clusterMembers, keywordClusters, keywordItems } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { assertProjectOwnership } from "@/lib/auth/ownership";
import { ok, fail, route, readJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const user = await requireSessionUser();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return fail("MISSING_PROJECT", "projectId wajib diisi.");
  await assertProjectOwnership(projectId, user.id);

  const db = getDb();
  const clusters = await db
    .select()
    .from(keywordClusters)
    .where(eq(keywordClusters.projectId, projectId))
    .orderBy(asc(keywordClusters.clusterName));
  const members = await db
    .select({ clusterId: clusterMembers.clusterId, keywordItemId: clusterMembers.keywordItemId })
    .from(clusterMembers)
    .where(inArray(clusterMembers.clusterId, clusters.map((c) => c.id)));
  const itemIds = [...new Set(members.map((m) => m.keywordItemId))];
  const items = itemIds.length
    ? await db
        .select({ id: keywordItems.id, keyword: keywordItems.keyword, normalized: keywordItems.normalized })
        .from(keywordItems)
        .where(inArray(keywordItems.id, itemIds))
    : [];
  const itemById = new Map(items.map((i) => [i.id, i]));
  const clusteredItemIds = new Set(members.map((m) => m.keywordItemId));

  const allItems = await db
    .select({ id: keywordItems.id, keyword: keywordItems.keyword })
    .from(keywordItems)
    .where(eq(keywordItems.projectId, projectId));

  return ok({
    clusters: clusters.map((c) => ({
      ...c,
      keywords: members
        .filter((m) => m.clusterId === c.id)
        .map((m) => itemById.get(m.keywordItemId))
        .filter((i): i is { id: string; keyword: string; normalized: string } => Boolean(i)),
    })),
    unassigned: allItems.filter((i) => !clusteredItemIds.has(i.id)),
  });
});

const manageSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("rename"),
    clusterId: z.string().uuid(),
    clusterName: z.string().min(1).max(200),
    intent: z.enum(["informational", "commercial", "transactional", "navigational"]).optional(),
    primaryKeyword: z.string().max(300).optional(),
    targetPage: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("move"),
    keywordItemId: z.string().uuid(),
    toClusterId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("merge"),
    intoClusterId: z.string().uuid(),
    fromClusterIds: z.array(z.string().uuid()).min(1).max(10),
  }),
  z.object({ action: z.literal("delete_cluster"), clusterId: z.string().uuid() }),
]);

export const POST = route(async (req) => {
  const user = await requireSessionUser();
  const parsed = manageSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail("INVALID_INPUT", "Aksi cluster tidak valid.");
  const body = parsed.data;
  const db = getDb();

  // Semua operasi memverifikasi cluster milik project milik user.
  async function ownedClusterId(clusterId: string): Promise<string | null> {
    const rows = await db
      .select({ projectId: keywordClusters.projectId })
      .from(keywordClusters)
      .where(eq(keywordClusters.id, clusterId))
      .limit(1);
    if (rows.length === 0) return null;
    try {
      await assertProjectOwnership(rows[0].projectId, user.id);
      return rows[0].projectId;
    } catch {
      return null;
    }
  }

  if (body.action === "rename") {
    if (!(await ownedClusterId(body.clusterId))) return fail("NOT_FOUND", "Cluster tidak ditemukan.", 404);
    await db
      .update(keywordClusters)
      .set({
        clusterName: body.clusterName,
        ...(body.intent ? { intent: body.intent } : {}),
        ...(body.primaryKeyword ? { primaryKeyword: body.primaryKeyword } : {}),
        ...(body.targetPage !== undefined ? { targetPage: body.targetPage } : {}),
        updatedAt: new Date(),
      })
      .where(eq(keywordClusters.id, body.clusterId));
    return ok({ updated: true });
  }

  if (body.action === "move") {
    const projectId = await ownedClusterId(body.toClusterId);
    if (!projectId) return fail("NOT_FOUND", "Cluster tujuan tidak valid.", 404);
    const kw = await db
      .select({ id: keywordItems.id })
      .from(keywordItems)
      .where(and(eq(keywordItems.id, body.keywordItemId), eq(keywordItems.projectId, projectId)))
      .limit(1);
    if (kw.length === 0) return fail("NOT_FOUND", "Keyword bukan milik project cluster.", 404);
    await db
      .delete(clusterMembers)
      .where(eq(clusterMembers.keywordItemId, body.keywordItemId));
    await db
      .insert(clusterMembers)
      .values({ clusterId: body.toClusterId, keywordItemId: body.keywordItemId })
      .onConflictDoNothing();
    return ok({ moved: true });
  }

  if (body.action === "merge") {
    const projectId = await ownedClusterId(body.intoClusterId);
    if (!projectId) return fail("NOT_FOUND", "Cluster tujuan tidak valid.", 404);
    for (const fromId of body.fromClusterIds) {
      const p = await ownedClusterId(fromId);
      if (p !== projectId) return fail("NOT_FOUND", "Hanya cluster dalam project yang sama dapat digabung.");
    }
    const memberRows = await db
      .select()
      .from(clusterMembers)
      .where(inArray(clusterMembers.clusterId, body.fromClusterIds));
    if (memberRows.length > 0) {
      await db
        .insert(clusterMembers)
        .values(
          memberRows.map((m) => ({ clusterId: body.intoClusterId, keywordItemId: m.keywordItemId })),
        )
        .onConflictDoNothing();
    }
    await db.delete(keywordClusters).where(inArray(keywordClusters.id, body.fromClusterIds));
    return ok({ merged: true, movedMembers: memberRows.length });
  }

  // delete_cluster
  if (!(await ownedClusterId(body.clusterId))) return fail("NOT_FOUND", "Cluster tidak ditemukan.", 404);
  await db.delete(keywordClusters).where(eq(keywordClusters.id, body.clusterId));
  return ok({ deleted: true });
});
