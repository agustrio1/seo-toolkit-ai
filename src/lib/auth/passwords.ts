import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;

/** Hash password dengan scrypt (node:crypto). Format: scrypt$N$r$p$saltHex$hashHex */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(normalize(password), salt, KEYLEN);
  return `scrypt$16384$8$1$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  if (!/^[0-9a-f]*$/i.test(parts[4]) || !/^[0-9a-f]+$/i.test(parts[5])) return false;
  const salt = Buffer.from(parts[4], "hex");
  const expected = Buffer.from(parts[5], "hex");
  const derived = await scrypt(normalize(password), salt, expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function normalize(password: string): string {
  // NFKC agar perlakuan karakter setara konsisten
  return password.normalize("NFKC");
}
