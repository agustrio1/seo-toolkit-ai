import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";

describe("hashPassword / verifyPassword", () => {
  it("roundtrip: password benar → true", async () => {
    const stored = await hashPassword("rahasia-123");
    await expect(verifyPassword("rahasia-123", stored)).resolves.toBe(true);
  });

  it("password salah → false", async () => {
    const stored = await hashPassword("rahasia-123");
    await expect(verifyPassword("rahasia-124", stored)).resolves.toBe(false);
  });

  it("format stored: scrypt$16384$8$1$saltHex$hashHex", async () => {
    const stored = await hashPassword("x");
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  });

  it("salt acak → hash berbeda untuk password sama", async () => {
    const a = await hashPassword("sama");
    const b = await hashPassword("sama");
    expect(a).not.toBe(b);
    await expect(verifyPassword("sama", a)).resolves.toBe(true);
    await expect(verifyPassword("sama", b)).resolves.toBe(true);
  });

  it("normalisasi NFKC: bentuk unicode setara lolos verifikasi", async () => {
    // "ﬁ" (U+FB01) menormalisasi menjadi "fi" (U+0066 U+0069)
    const stored = await hashPassword("fiesta");
    await expect(verifyPassword("ﬁesta", stored)).resolves.toBe(true);
  });

  it("stored cacat / algoritma asing → false, tidak melempar", async () => {
    await expect(verifyPassword("x", "bcrypt$2a$10$abc")).resolves.toBe(false);
    await expect(verifyPassword("x", "scrypt$16384$8$1$zz$yy")).resolves.toBe(false);
    await expect(verifyPassword("x", "terlalu$sedikit$bagian")).resolves.toBe(false);
    await expect(verifyPassword("x", "")).resolves.toBe(false);
  });
});
