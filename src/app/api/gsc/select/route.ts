import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { integrations } from "@/lib/db/schema";
import { requireSessionUser } from "@/lib/auth/sessions";
import { assertProjectOwnership } from "@/lib/auth/ownership";
import { ok, fail, route, readJson } from "@/lib/api/response";
import { revokeAccessToken, GscOAuthError } from "@/lib/gsc/oauth";

export const runtime = "nodejs";

const selectSchema = z.object({
  projectId: z.string().uuid(),
  siteUrl: z.string().max(400),
});

/** Pilih properti GSC yang dipetakan ke project. */
export const POST = route(async (req) => {
  const user = await requireSessionUser();
  const parsed = selectSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail("INVALID_INPUT", "Pemilihan properti tidak valid.");
  const { projectId, siteUrl } = parsed.data;
  await assertProjectOwnership(projectId, user.id);

  const db = getDb();
  const rows = await db
    .select()
    .from(integrations)
    .where(eq(integrations.userId, user.id))
    .limit(1);
  if (rows.length === 0 || rows[0].status !== "connected") {
    return fail("NOT_CONNECTED", "Akun Google belum terhubung.", 400);
  }
  await db
    .update(integrations)
    .set({ property: siteUrl, projectId, updatedAt: new Date() })
    .where(eq(integrations.id, rows[0].id));
  return ok({ selected: siteUrl });
});

/** Putus koneksi: cabut token di Google lalu hapus dari database. */
export const DELETE = route(async () => {
  const user = await requireSessionUser();
  const db = getDb();
  const rows = await db
    .select()
    .from(integrations)
    .where(eq(integrations.userId, user.id))
    .limit(1);
  if (rows.length === 0) return ok({ disconnected: true });
  const integ = rows[0];

  let revokeWarning = false;
  if (integ.status === "connected" && integ.accessTokenEnc) {
    try {
      const { decryptSecret } = await import("@/lib/crypto/token-crypto");
      const token = decryptSecret(integ.accessTokenEnc);
      await revokeAccessToken(token);
    } catch (e) {
      revokeWarning = !(e instanceof GscOAuthError) || e.code === "REVOKE_FAILED";
    }
  }
  await db
    .update(integrations)
    .set({
      accessTokenEnc: null,
      refreshTokenEnc: null,
      tokenExpiresAt: null,
      status: "disconnected",
      property: null,
      updatedAt: new Date(),
    })
    .where(eq(integrations.id, integ.id));
  return ok({
    disconnected: true,
    warning: revokeWarning
      ? "Token dihapus dari aplikasi, tetapi pencabutan di sisi Google gagal; cabut manual di myaccount.google.com/permissions."
      : undefined,
  });
});
