import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { AuthError } from "./sessions";

/**
 * Verifikasi kepemilikan project di server.
 * ID dari browser BUKAN bukti otorisasi — selalu cocokkan dengan userId sesi.
 */
export async function assertProjectOwnership(projectId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  if (rows.length === 0) throw new AuthError("FORBIDDEN");
}
