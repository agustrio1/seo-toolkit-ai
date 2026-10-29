import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Enkripsi AES-256-GCM application-level untuk token OAuth.
 * Key: OAUTH_TOKEN_ENC_KEY — 32 byte, format hex atau base64url.
 * PENTING: jika key ini hilang, token tersimpan tidak dapat dipulihkan
 * dan pengguna harus menghubungkan ulang akun Google. Dokumentasikan di README.
 */
function getKey(): Buffer {
  const raw = process.env.OAUTH_TOKEN_ENC_KEY;
  if (!raw) throw new Error("OAUTH_TOKEN_ENC_KEY belum dikonfigurasi.");
  let key: Buffer;
  try {
    key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64url");
  } catch {
    throw new Error("OAUTH_TOKEN_ENC_KEY format tidak valid.");
  }
  if (key.length !== 32) throw new Error("OAUTH_TOKEN_ENC_KEY harus 32 byte.");
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptSecret(payload: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Format token terenkripsi tidak valid.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]).toString("utf8");
}
